# Docxy — design system

Docxy é uma plataforma SaaS para gerenciar, ler, comparar e extrair informações de documentos (contratos, apólices, documentos jurídicos e financeiros). A interface transmite tecnologia, segurança, precisão e confiabilidade: dark premium, minimalista e corporativa, com o amarelo Docxy reservado para as ações principais.

Este sistema foi montado a partir de 11 telas de referência (login, arquivos, pastas, visualizador, comparação, extrator, métricas, dashboard de comparação e workspaces), dos dois arquivos de logotipo e do brief do projeto. As cores foram medidas em pixel nas capturas; espaçamentos, raios e tipografia são estimativas a partir delas.

## Princípios

- **Escuro por padrão.** Tudo acontece sobre `bg-page`; painéis e cards sobem um degrau para `surface`, o cabeçalho para `surface-raised` e modais para `surface-overlay`. Não há tema claro — o único elemento branco é o papel do documento (`paper`).
- **Um amarelo, poucas vezes.** `brand-yellow` marca a ação principal de cada área (busca, aba ativa, ferramenta ativa, ícone da pasta de trabalho). Botões secundários são pílulas brancas com texto escuro e caixa-alta espaçada.
- **Cor de diferença tem significado fixo.** `diff-removed` (vermelho) = removido ou original substituído, sempre no documento da esquerda; `diff-inserted` (verde-limão) = inserido ou novo, sempre na direita. Nunca use essas cores para decoração.
- **Separações discretas.** Profundidade vem de degraus de superfície, raios generosos e divisores finos em `border`, não de sombras fortes ou brilho.
- **Nada de dado fictício na UI real.** Campos não encontrados mostram "Não identificado"; métricas mostram a fórmula usada.

## Voz

Português do Brasil, frases curtas e funcionais: "O que procura?", "Criar Pasta de Trabalho", "Esqueci a senha". Botões em caixa-alta com espaçamento largo ("UPLOAD ARQUIVO", "ENTRAR", "EXTRAIR"); rótulos e menus em caixa de frase. Termos de mercado de resseguro podem ficar em inglês quando é o uso corrente (Broker, Brokerage, Line of Business).

## Cores

| Papel | Token | Valor medido | Brief |
| --- | --- | --- | --- |
| Fundo geral | `bg-page` | #1f232e | #1E2430 |
| Painéis | `surface` | #2a3040 | #283244 |
| Fundo secundário / login | `bg-login` | #111722 | #171E2A |
| Áreas internas | `surface-sunken` | #20242f | #1D2330 |
| Bordas | `border` | #4d576d | #3A465B |
| Texto principal | `ink` | #ffffff | #F4F6FA |
| Texto secundário | `ink-muted` | #98a1b8 | #97A3B9 |
| Amarelo Docxy | `brand-yellow` | #f7ec5c | #FFF02A |
| Azul de interação | `accent-blue` | #3471e3 | #187BFF |
| Ciano de gráficos | `chart-cyan` | #5cc8f6 | #00D5F2 |
| Remoções | `diff-removed` | #dc3a37 | #FF334B |
| Inserções | `diff-inserted` | #bcca40 | #D0E500 |

O brief pede ajustar as cores às referências mantendo contraste; os tokens seguem o que as telas mostram. Três pares das referências não passam 4.5:1 e estão marcados nas notas dos tokens: `accent-blue` sobre o painel de login (3.8:1), `diff-inserted` como texto sobre papel branco (1.8:1) e texto branco sobre `avatar-orange` (2.4:1).

## Tipografia

Uma família sans geométrica em pesos médios. As telas parecem usar Gotham; `Montserrat` (Google Fonts) é o substituto aberto até a fonte oficial ser confirmada. Rótulos em `label` 12px, corpo em `body` 15px, títulos de card em `title` 18px, botões em `button-caps` com `letter-spacing: .2em`.

## Forma e espaço

Raios grandes: `radius-md` nos cards, `radius-lg` em painéis e no cabeçalho, `radius-pill` em botões, busca, toggles e avatares. Grade de 4px (`space-1` a `space-8`). Áreas vazias do dashboard levam uma grade de "+" bem discreta em `ink-subtle` com baixa opacidade.

## Iconografia

Ícones lineares de traço fino (o brief indica Lucide), em `ink` ou `ink-muted`; a ferramenta ativa da barra lateral direita fica em `brand-yellow`. Arquivos PDF usam o ícone vermelho de PDF; pastas de trabalho usam o ícone amarelo com o símbolo Docxy.

## Logotipo

Dois arquivos em `assets/Logos`: positivo (palavra em `logo-ink`) para fundo claro e negativo (palavra branca) para fundo escuro — a versão usada em toda a aplicação. O símbolo é sempre `logo-yellow`. Observação: as telas de referência ainda mostram a palavra "doccly"; o nome e o arquivo oficiais são **docxy**.

## Seções

- [`telas.md`](telas.md) — análise das 11 telas de referência.
- `src/components/ui` — componentes base implementados.

## Tokens no código

Os tokens vivem em `src/app/globals.css` (bloco `@theme`) e viram classes do Tailwind: `bg-page`, `bg-surface`, `text-ink-muted`, `bg-brand`, `text-removed`, `bg-inserted`, `rounded-md`… O design system completo (com capa, assets e notas de uso) também está publicado como artefato no Claude.
