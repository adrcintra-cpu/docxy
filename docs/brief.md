# PROJETO DOCXY — Plataforma Inteligente de Gestão e Comparação de Documentos

## 1. PAPEL E OBJETIVO

Atue como um time sênior formado por Product Manager, UX/UI Designer, Arquiteto de Software, Desenvolvedor Full Stack e Especialista em Inteligência Artificial aplicada à análise documental.

Sua missão é desenvolver o **DOCXY**, uma plataforma SaaS profissional para gerenciamento, armazenamento, organização, leitura, comparação, análise e extração inteligente de informações de documentos.

Utilize todas as imagens anexadas como referência principal para reproduzir a identidade visual, a estrutura de navegação, os componentes e a experiência do usuário.

O resultado deve ser uma aplicação real, não apenas telas demonstrativas.

O sistema deve permitir que empresas e equipes trabalhem com documentos, identifiquem alterações entre versões, consultem informações com inteligência artificial e gerenciem permissões de acesso.

**Princípio fundamental: cada botão, ferramenta, indicador e funcionalidade apresentada na interface deverá possuir uma implementação real ou um estado claramente identificado como não disponível.**

---

## 2. IDENTIDADE VISUAL E DESIGN SYSTEM

Reproduzir a linguagem visual das referências anexadas com alta fidelidade.

### Paleta principal

- Background geral: #1E2430
- Superfícies e painéis: #283244
- Background secundário: #171E2A
- Inputs e áreas internas: #1D2330
- Bordas: #3A465B
- Texto principal: #F4F6FA
- Texto secundário: #97A3B9
- Amarelo Docxy: #FFF02A
- Azul de interação: #187BFF
- Ciano para gráficos: #00D5F2
- Vermelho para remoções: #FF334B
- Verde-limão para inserções e alterações: #D0E500

As cores devem ser ajustadas visualmente com base nas referências, mantendo contraste e acessibilidade.

### Direção de arte

Interface dark premium, minimalista e corporativa.

Características:

- Layout desktop-first, responsivo.
- Cards com cantos arredondados.
- Painéis com sombras suaves.
- Separações discretas.
- Tipografia sans-serif moderna.
- Ícones lineares consistentes.
- Botões amarelos para ações principais.
- Microinterações elegantes.
- Transições suaves.
- Hierarquia visual rigorosa.
- Densidade de informação equilibrada.
- Componentes reutilizáveis.

Evitar gradientes exagerados, excesso de brilho, efeitos neon e elementos visuais genéricos de IA.

A interface deve transmitir tecnologia, segurança, precisão e confiabilidade.

### Tela de login

Criar a tela inicial conforme referência:

- Fundo azul-marinho escuro.
- Elemento abstrato tridimensional composto por milhares de pontos luminosos azuis.
- Animação orgânica suave, com movimento contínuo.
- Painel de autenticação à direita.
- Logotipo DOCXY.
- Login por e-mail e senha.
- Mostrar/ocultar senha.
- Manter conectado.
- Recuperação de senha.
- Autenticação com Microsoft, Google e Apple, quando configurada.

O elemento animado deve ser otimizado para desempenho e possuir alternativa estática para dispositivos com menor capacidade gráfica.

---

## 3. ARQUITETURA TECNOLÓGICA

Utilizar preferencialmente:

**Frontend**
- React com TypeScript.
- Next.js.
- Tailwind CSS.
- shadcn/ui.
- Lucide Icons.

**Backend**
- Next.js API Routes ou serviço backend modular.
- PostgreSQL.
- Prisma ORM.
- Supabase Auth ou autenticação equivalente.
- Supabase Storage ou armazenamento privado compatível com S3.

**Documentos**
- PDF.js para visualização.
- Extração de texto de PDF.
- Suporte inicial a PDF e DOCX.
- OCR para documentos digitalizados.
- Normalização de texto.
- Algoritmos de comparação textual.
- Processamento assíncrono para arquivos grandes.

**Inteligência Artificial**
- Integração com provedor de LLM configurável.
- Extração estruturada.
- Busca semântica.
- Resumos inteligentes.
- Análise de cláusulas.
- Perguntas e respostas fundamentadas nos documentos.

As chaves de API devem permanecer exclusivamente no backend.

Criar arquitetura modular, segura e preparada para expansão.

---

## 4. MÓDULO DE AUTENTICAÇÃO

Implementar:

1. Login por e-mail e senha.
2. Recuperação de senha.
3. Logout.
4. Persistência segura de sessão.
5. Autenticação social, conforme provedores configurados.
6. Controle de permissões por usuário.
7. Isolamento entre organizações.
8. Convites por e-mail.
9. Registro de acessos e eventos relevantes.

Perfis:

- Administrador.
- Proprietário (Owner).
- Editor.
- Colaborador com permissão de escrita.
- Visualizador.

As permissões devem ser verificadas no backend, não apenas na interface.

---

## 5. DASHBOARD DE DOCUMENTOS

Construir a interface principal conforme as referências.

### Cabeçalho

Exibir:

- Menu lateral.
- Nome da organização ou workspace.
- Logotipo DOCXY.
- Notificações.
- Perfil do usuário.

### Barra superior

Incluir:

- Alternância entre visualização por ícones e lista.
- Pesquisa de documentos.
- Filtro de documentos.
- Acesso aos itens fixados.
- Botão de upload.
- Criação de pasta de trabalho.

### Menu lateral

Organizar:

**Fixados**
- Pastas favoritas.
- Documentos fixados.

**Recentes**
- Documentos acessados recentemente.
- Pastas utilizadas recentemente.

### Área principal

Apresentar cards para pastas e documentos.

Cada card deve possuir:

- Nome.
- Ícone correspondente.
- Menu contextual.
- Pré-visualização quando aplicável.
- Quantidade de arquivos.
- Tamanho.
- Participantes.
- Estado de compartilhamento.

### Funcionalidades

- Criar pasta.
- Renomear.
- Mover.
- Duplicar quando aplicável.
- Excluir.
- Restaurar da lixeira.
- Fixar e desafixar.
- Compartilhar.
- Pesquisar.
- Ordenar.
- Filtrar.
- Alternar entre grade e lista.

Utilizar dados reais do banco.

---

## 6. WORKSPACES E COLABORAÇÃO

Criar módulo para organização de equipes e espaços de trabalho.

Cada workspace deverá possuir:

- Nome.
- Descrição.
- Data de criação.
- Administradores.
- Membros.
- Pastas.
- Documentos.
- Permissões.
- Status ativo/inativo.

Implementar:

- Criar workspace.
- Editar workspace.
- Adicionar membros.
- Remover membros.
- Definir permissões.
- Ativar ou desativar acesso.
- Consultar atividades.

Garantir que documentos privados não sejam acessíveis por usuários não autorizados.

---

## 7. GESTÃO DE DOCUMENTOS E VERSIONAMENTO

Criar um módulo completo de gerenciamento documental.

### Upload

Permitir:

- Upload individual.
- Upload múltiplo.
- Arrastar e soltar.
- Validação de formato e tamanho.
- Barra de progresso.
- Identificação de arquivos duplicados.
- Processamento em segundo plano.

### Versionamento

Cada documento poderá possuir múltiplas versões.

Exemplo:

Contrato de Prestação de Serviços

- Versão 01.
- Versão 02.
- Versão 03.
- Versão 04.

Registrar:

- Identificador da versão.
- Data de upload.
- Usuário responsável.
- Tamanho.
- Hash do arquivo.
- Comentários.
- Histórico de alterações.
- Última visualização.

Preservar as versões anteriores e permitir comparação entre quaisquer duas versões autorizadas.

### Lista de arquivos

Reproduzir a interface de tabela apresentada nas referências.

Colunas:

- Arquivo.
- Versão.
- Tamanho.
- Data de inserção.
- Última abertura.
- Status.
- Ações.

---

## 8. VISUALIZADOR DE DOCUMENTOS

Criar visualizador profissional de PDF integrado à aplicação.

Funcionalidades:

- Abrir documentos.
- Navegar entre páginas.
- Zoom.
- Ajustar à largura.
- Ajustar à página.
- Pesquisar texto.
- Selecionar texto.
- Exibir número de página.
- Visualização em tela cheia.
- Download autorizado.
- Navegação por miniaturas.
- Suporte a múltiplos documentos.

O visualizador deverá manter a aparência do projeto, evitando interfaces externas visualmente incompatíveis.

---

## 9. MOTOR DE COMPARAÇÃO DE DOCUMENTOS

**Este é o principal diferencial do DOCXY. Priorizar precisão, desempenho e usabilidade.**

Permitir selecionar dois documentos ou duas versões do mesmo documento.

### Interface

Reproduzir o modelo apresentado:

- Documento original à esquerda.
- Documento revisado à direita.
- Barra de ferramentas superior.
- Painel lateral de diferenças.
- Navegação sincronizada.
- Destaques coloridos.
- Indicadores de alterações.

### Tipos de alterações

Identificar:

1. Texto inserido.
2. Texto removido.
3. Texto substituído.
4. Parágrafos alterados.
5. Cláusulas modificadas.
6. Mudanças numéricas.
7. Alterações de datas.
8. Alterações de valores monetários.
9. Mudanças de nomes e entidades.
10. Alterações na estrutura do documento.

### Destaques

Usar:

- Vermelho: conteúdo removido ou original substituído.
- Verde-limão: conteúdo inserido ou novo.
- Indicadores laterais: localização das alterações.

Cada alteração deve possuir referência ao trecho original e ao trecho revisado.

### Navegação

Ao clicar em uma diferença:

- Localizar o trecho correspondente.
- Rolar os dois documentos até a região relevante.
- Destacar os trechos.
- Atualizar o painel lateral.
- Exibir contexto anterior e posterior.

Criar controles para navegar entre a alteração anterior e a próxima.

### Requisitos técnicos

Não utilizar apenas comparação simples de strings.

Implementar pipeline com:

1. Extração textual.
2. Normalização controlada.
3. Segmentação em páginas, blocos, parágrafos e palavras.
4. Alinhamento entre trechos.
5. Detecção de diferenças.
6. Mapeamento para coordenadas visuais.
7. Classificação das alterações.
8. Persistência dos resultados.

Preservar números, datas, pontuação relevante e conteúdo jurídico.

Diferenciar alterações de formatação de alterações de conteúdo.

Não tratar automaticamente uma simples mudança de posição como exclusão e reinserção.

A IA poderá enriquecer a classificação, mas o resultado textual deverá ser verificável por algoritmos determinísticos.

---

## 10. LISTA DE MUDANÇAS

Criar painel lateral conforme referência.

Cada item deverá apresentar:

- Tipo de alteração.
- Trecho anterior.
- Trecho novo.
- Número da página.
- Localização.
- Status de revisão.
- Menu de ações.

Filtros:

- Todas.
- Inseridas.
- Removidas.
- Substituídas.
- Alterações numéricas.
- Alterações relevantes.

Permitir marcar diferenças como revisadas e adicionar comentários.

Exibir contador de diferenças.

O usuário deverá conseguir selecionar uma alteração e localizar sua posição nos documentos.

---

## 11. MÉTRICAS DA COMPARAÇÃO

Implementar painel de métricas com informações calculadas a partir dos resultados reais.

### Mudanças analisadas

- Inserções.
- Remoções.
- Substituições.
- Total de alterações.
- Percentual de diferença.

### Palavras analisadas

- Palavras iguais.
- Palavras inseridas.
- Palavras removidas.
- Palavras substituídas.

### Visualização

Utilizar gráficos discretos, consistentes com o design system.

O cálculo percentual deverá possuir fórmula documentada e não poderá apresentar números fictícios.

Exibir claramente o critério utilizado para medir diferenças.

---

## 12. EXTRAÇÃO INTELIGENTE DE INFORMAÇÕES

Criar ferramenta de extração de dados contratuais.

### Exemplos de campos

- Número do contrato.
- Contratante.
- Contratada.
- Cedente.
- Seguradora.
- Corretora (Broker).
- Prêmio.
- Moeda.
- Comissão.
- Vigência.
- Data de início.
- Data de término.
- Percentuais.
- Valores financeiros.
- Obrigações contratuais.

### Interface

Painel lateral com seleção do extrator.

Exibir informações organizadas em cards, incluindo:

- Nome do campo.
- Valor extraído.
- Indicador de confiança.
- Referência ao documento.
- Botão para localizar a informação.

### Extratores configuráveis

Permitir criar modelos de extração para diferentes tipos de documento.

Exemplos:

- Contratos.
- Apólices.
- Documentos jurídicos.
- Documentos financeiros.
- Propostas comerciais.

**Não inventar dados ausentes.**

Quando não for possível identificar uma informação, exibir "Não identificado".

Permitir validação e correção manual dos resultados.

---

## 13. DASHBOARD DE COMPARAÇÃO

Criar modal ou painel de comparação estruturada entre dois documentos.

Reproduzir a referência visual apresentada.

Dividir em duas colunas:

- Documento original.
- Documento revisado.

Exibir campos correspondentes lado a lado.

Exemplos:

- Número do contrato.
- Cedente.
- Broker.
- Prêmio.
- Comissão.
- Percentual de variação.
- Vigência.
- Line of Business (LoB).

### Gráficos

Utilizar gráficos circulares e barras horizontais para valores comparáveis.

### Inteligência

Destacar:

- Valores iguais.
- Valores alterados.
- Campos ausentes.
- Divergências relevantes.

Os dados devem ser extraídos efetivamente dos documentos.

Não utilizar percentuais ou valores demonstrativos em resultados reais.

---

## 14. ASSISTENTE DE INTELIGÊNCIA ARTIFICIAL

Criar assistente integrado ao visualizador.

O usuário poderá fazer perguntas sobre um ou mais documentos.

Exemplos:

- Quais foram as principais alterações?
- Quais cláusulas foram modificadas?
- Houve mudança de valores?
- Quais obrigações foram adicionadas?
- Quais são as diferenças entre as versões?
- Resuma este contrato.
- Quais são os prazos relevantes?
- Existem divergências entre os documentos?

### Funcionamento

Implementar análise fundamentada no conteúdo documental, com recuperação de trechos relevantes.

As respostas deverão apresentar:

- Resposta objetiva.
- Explicação quando necessária.
- Referência ao documento.
- Página.
- Trecho de origem.

Permitir clicar na referência para navegar até o trecho.

A IA não deverá afirmar informações sem evidências nos documentos.

Quando não encontrar a resposta, informar a limitação.

Manter histórico de conversas por documento ou sessão, respeitando as permissões de acesso.

---

## 15. RESUMO INTELIGENTE

Implementar geração de resumos.

Modalidades:

- Resumo executivo.
- Resumo de alterações.
- Resumo contratual.
- Resumo de riscos.
- Resumo de informações financeiras.

O resumo de alterações deverá destacar mudanças potencialmente relevantes, sem substituir a avaliação jurídica ou profissional.

Permitir copiar e exportar os resultados.

---

## 16. PAINEL DE FERRAMENTAS

Reproduzir a barra lateral direita das referências.

Incluir módulos para:

- Revisão.
- Extração.
- Assistente de IA.
- Comparação.
- Métricas.
- Dashboard.
- Visualização dividida.
- Exportação.
- Navegação entre versões.

Cada ferramenta deverá abrir seu respectivo painel sem recarregar a aplicação.

Manter o estado dos documentos abertos durante a navegação.

---

## 17. PESQUISA GLOBAL

Criar pesquisa por:

- Nome do documento.
- Nome da pasta.
- Conteúdo textual.
- Tipo de arquivo.
- Data.
- Workspace.
- Tags.
- Campos extraídos.

Implementar pesquisa textual e preparar estrutura para busca semântica.

Os resultados deverão respeitar integralmente as permissões de cada usuário.

---

## 18. NOTIFICAÇÕES E AUDITORIA

Implementar notificações para:

- Documentos compartilhados.
- Novas versões.
- Alterações relevantes.
- Convites para workspaces.
- Comentários.
- Processamentos concluídos.

Criar histórico de auditoria:

- Usuário.
- Evento.
- Documento.
- Data e horário.
- Identificador da versão.
- Resultado da operação.

---

## 19. SEGURANÇA

O DOCXY trabalhará com documentos potencialmente confidenciais.

Implementar:

- HTTPS.
- Controle de acesso por organização.
- Validação de permissões no servidor.
- Armazenamento privado.
- URLs temporárias para arquivos.
- Proteção contra upload malicioso.
- Validação de tipos e tamanhos.
- Proteção contra acesso indevido.
- Logs de auditoria.
- Gestão segura de credenciais.
- Política de retenção e exclusão.
- Princípios de minimização de dados e LGPD.

Não enviar documentos confidenciais para provedores de IA sem configuração e autorização apropriadas.

Evitar registrar conteúdo sensível em logs.

---

## 20. EXPERIÊNCIA DO USUÁRIO

Implementar estados completos para:

- Carregamento.
- Upload em andamento.
- Processamento.
- Sucesso.
- Erro.
- Documento incompatível.
- Documento sem texto extraível.
- Comparação sem diferenças.
- Falha na extração.
- Sessão expirada.
- Falta de permissão.

Adicionar mensagens claras e feedback visual consistente.

A navegação deve ser fluida e intuitiva.

---

## 21. RESPONSIVIDADE

Priorizar experiência desktop em resoluções de 1440 px ou superiores.

Adaptar para:

- Notebooks.
- Tablets.
- Smartphones.

No mobile, substituir a comparação simultânea por navegação alternada quando não houver espaço suficiente.

Não comprometer a legibilidade dos documentos.

---

## 22. BANCO DE DADOS

Projetar estrutura relacional para:

- Users.
- Organizations.
- Workspaces.
- WorkspaceMembers.
- Folders.
- Documents.
- DocumentVersions.
- DocumentPermissions.
- DocumentShares.
- Comparisons.
- ComparisonChanges.
- Extractors.
- ExtractionResults.
- AIConversations.
- AIMessages.
- Comments.
- Notifications.
- AuditLogs.

Criar relacionamentos, índices, políticas de acesso e migrações.

Evitar exclusões em cascata que possam destruir históricos documentais importantes.

---

## 23. ETAPAS DE IMPLEMENTAÇÃO

Executar o projeto em fases organizadas.

### Fase 1 — Fundação
- Arquitetura.
- Design system.
- Banco de dados.
- Autenticação