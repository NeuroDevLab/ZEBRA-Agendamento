-- Agendamento de acasalamento — Biotério de Peixe-Zebra
-- Execute este arquivo inteiro no SQL Editor do Supabase (uma única vez).
--
-- Regras garantidas pelo banco (não dá para burlar pelo navegador):
--   * no máximo 2 agendamentos por data de postura;
--   * cada aquário matriz (R1 a R10) só pode ser usado uma vez por data;
--   * a postura deve ser a partir de amanhã (fuso de São Paulo) e até 1 ano à frente;
--   * só quem criou o agendamento (com o token salvo no navegador) pode cancelá-lo.

create table if not exists public.agendamentos (
  id            uuid primary key default gen_random_uuid(),
  pesquisador   text not null check (char_length(btrim(pesquisador)) between 2 and 80),
  laboratorio   text check (laboratorio is null or char_length(laboratorio) <= 80),
  aquario       text not null check (aquario ~ '^R([1-9]|10)$'),
  data_postura  date not null,
  data_montagem date generated always as (data_postura - 1) stored,
  vaga          smallint not null check (vaga in (1, 2)),
  token         uuid not null default gen_random_uuid(),
  criado_em     timestamptz not null default now(),
  constraint agendamentos_vaga_unica    unique (data_postura, vaga),
  constraint agendamentos_aquario_unico unique (data_postura, aquario)
);

-- Ninguém acessa a tabela diretamente: tudo passa pelas funções abaixo.
alter table public.agendamentos enable row level security;
revoke all on public.agendamentos from anon, authenticated;

-- Lista os agendamentos de um período (sem o token de cancelamento).
create or replace function public.listar_agendamentos(p_inicio date, p_fim date)
returns table (
  id uuid, pesquisador text, laboratorio text, aquario text,
  data_postura date, data_montagem date, criado_em timestamptz
)
language sql stable security definer set search_path = public
as $$
  select a.id, a.pesquisador, a.laboratorio, a.aquario, a.data_postura, a.data_montagem, a.criado_em
  from public.agendamentos a
  where a.data_postura between p_inicio and least(p_fim, p_inicio + 400)
  order by a.data_postura, a.vaga;
$$;

-- Cria um agendamento respeitando o limite de 2 por data de postura.
create or replace function public.agendar(
  p_pesquisador text, p_laboratorio text, p_aquario text, p_data_postura date
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_hoje  date := (now() at time zone 'America/Sao_Paulo')::date;
  v_nome  text := btrim(coalesce(p_pesquisador, ''));
  v_lab   text := nullif(btrim(coalesce(p_laboratorio, '')), '');
  v_vaga  smallint;
  v_id    uuid;
  v_token uuid;
begin
  if char_length(v_nome) < 2 then
    raise exception 'Informe o nome do pesquisador.';
  end if;
  if p_data_postura is null or p_data_postura <= v_hoje then
    raise exception 'A data da postura deve ser a partir de amanhã (os casais são montados no dia anterior).';
  end if;
  if p_data_postura > v_hoje + 365 then
    raise exception 'A data da postura está muito distante (máximo de 1 ano).';
  end if;
  if p_aquario is null or p_aquario !~ '^R([1-9]|10)$' then
    raise exception 'Escolha um aquário matriz (R1 a R10).';
  end if;

  -- Serializa agendamentos concorrentes para a mesma data.
  perform pg_advisory_xact_lock(hashtext('zebra-agendamento:' || p_data_postura::text));

  if exists (select 1 from public.agendamentos a
             where a.data_postura = p_data_postura and a.aquario = p_aquario) then
    raise exception 'O aquário % já está reservado para esta data de postura.', p_aquario;
  end if;

  select v.n into v_vaga
  from (values (1::smallint), (2::smallint)) as v(n)
  where not exists (select 1 from public.agendamentos a
                    where a.data_postura = p_data_postura and a.vaga = v.n)
  order by v.n
  limit 1;

  if v_vaga is null then
    raise exception 'Esta data de postura já tem 2 agendamentos (capacidade máxima de casais).';
  end if;

  insert into public.agendamentos (pesquisador, laboratorio, aquario, data_postura, vaga)
  values (v_nome, v_lab, p_aquario, p_data_postura, v_vaga)
  returning agendamentos.id, agendamentos.token into v_id, v_token;

  return jsonb_build_object('id', v_id, 'token', v_token, 'data_montagem', p_data_postura - 1);
end;
$$;

-- Cancela um agendamento (somente com o token de quem criou).
create or replace function public.cancelar_agendamento(p_id uuid, p_token uuid)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  n int;
begin
  delete from public.agendamentos a where a.id = p_id and a.token = p_token;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

revoke execute on function public.listar_agendamentos(date, date) from public;
revoke execute on function public.agendar(text, text, text, date) from public;
revoke execute on function public.cancelar_agendamento(uuid, uuid) from public;
grant execute on function public.listar_agendamentos(date, date) to anon, authenticated;
grant execute on function public.agendar(text, text, text, date) to anon, authenticated;
grant execute on function public.cancelar_agendamento(uuid, uuid) to anon, authenticated;
