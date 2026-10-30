# 🐟 ZEBRA-Agendamento

Aplicativo Web para agendamento das reproduções do Biotério Zebrafish CREAL/UFRGS.

Aplicativo web estático (GitHub Pages) usado pelos laboratórios para agendar o acasalamento dos peixes-zebra.
Os dados ficam no projeto Supabase **ZEBRA-Agendamento** (região São Paulo), já configurado em `config.js`.

## Regras

- **No máximo 2 agendamentos por data de postura** (capacidade de montagem de casais).
- Cada **aquário matriz (R1 a R10)** só pode ser reservado uma vez por data.
- O pesquisador informa a **data da postura**; os **casais são montados no dia anterior**
  (ex.: postura na quarta → montagem na terça). O app avisa quando a montagem cai em fim de semana.
- A postura precisa ser a partir de amanhã.
- Só quem fez o agendamento (no mesmo navegador) vê o botão **Cancelar**.
  O administrador pode apagar qualquer agendamento pelo painel do Supabase (Table Editor → `agendamentos`).

O painel **Montagem de casais** mostra o que a equipe do biotério precisa montar hoje e amanhã.

## Arquivos

| Arquivo | Função |
|---|---|
| `index.html`, `styles.css`, `app.js` | O aplicativo |
| `config.js` | Endereço e chave do Supabase |
| `supabase/setup.sql` | Cria a tabela e as funções que garantem as regras |

## 1. Banco de dados compartilhado (Supabase, gratuito)

O GitHub Pages só hospeda arquivos estáticos, então os agendamentos ficam no Supabase para que
todos os laboratórios vejam a mesma agenda.

1. Crie uma conta em <https://supabase.com> e um novo projeto (plano Free).
2. No projeto, abra **SQL Editor → New query**, cole todo o conteúdo de `supabase/setup.sql` e clique em **Run**.
3. Vá em **Project Settings → API** (ou **API Keys**) e copie:
   - a **Project URL** (ex.: `https://abcdefghijkl.supabase.co`);
   - a chave **publishable** (`sb_publishable_...`) ou **anon**.
4. Preencha o `config.js`:

   ```js
   window.ZEBRA_CONFIG = {
     supabaseUrl: 'https://abcdefghijkl.supabase.co',
     supabaseKey: 'sb_publishable_...',
   };
   ```

> A chave publishable/anon é pública por natureza (fica visível no site). A tabela não pode ser
> acessada diretamente: o app só consegue chamar as funções do banco, que impõem o limite de 2
> agendamentos por data, impedem aquário repetido e exigem o token para cancelar.
> **Nunca** coloque a chave `service_role`/`secret` no `config.js`.

Sem o `config.js` preenchido o app funciona em **modo demonstração** (dados salvos só no navegador),
útil para testar.

## 2. Publicar no GitHub Pages

1. Crie um repositório no GitHub (ex.: `zebra-agendamento`) e envie estes arquivos:

   ```bash
   git init
   git add .
   git commit -m "Agendamento de acasalamento"
   git branch -M main
   git remote add origin https://github.com/SEU-USUARIO/zebra-agendamento.git
   git push -u origin main
   ```

2. No repositório: **Settings → Pages → Build and deployment → Source: Deploy from a branch**,
   escolha `main` e a pasta `/ (root)` e salve.
3. Em 1–2 minutos o site estará em `https://SEU-USUARIO.github.io/zebra-agendamento/`.

## Testar localmente

```bash
python -m http.server 8000
```

e abra <http://localhost:8000>.

## Ajustes comuns

- **Mudar a capacidade por dia:** altere `MAX_POR_DIA` em `app.js` e, no `setup.sql`, a checagem
  `vaga in (1, 2)` e a lista `values (1), (2)` da função `agendar` (rode o SQL de novo).
- **Mais aquários:** altere `AQUARIOS` em `app.js` e a expressão `^R([1-9]|10)$` no `setup.sql`.
