# Histórico de etapas

Registro do que foi entregue em cada etapa do desenvolvimento do PlanKraft.

## Etapa 1 — pronto
- Janela 1280×800 centralizada, menu nativo, layout (toolbar, opções da ferramenta, camadas, propriedades, status).
- Tema claro/escuro/sistema.
- Grid adaptativo ao zoom, zoom na roda (ancorado no cursor), pan (botão do meio, Espaço+arrastar, ferramenta Mão), ajustar à tela.
- **Parede**: arrastar, ou clique-a-clique em polilinha (Enter/Esc/duplo clique/botão direito encerra; clicar no ponto inicial fecha), modo **Retângulo** (4 paredes), espessura ajustável, ímã no grid e nas extremidades, Shift trava 45°, Alt desliga ímã, medida + ângulo ao vivo (texto nunca de cabeça para baixo).
- Cantos e encontros em T desenhados como peça única.
- **Selecionar**: clique, Shift+clique, seleção por área, mover (paredes conectadas esticam junto), alças nas extremidades, Delete, Ctrl+A.
- Propriedades: comprimento (editável), espessura, ângulo, camada. Undo/Redo (Ctrl+Z / Ctrl+Y).
- Camadas padrão com visibilidade, bloqueio, camada ativa e contador; toast ao desenhar em camada bloqueada/oculta.

## Etapa 2 — pronto
- **Porta** e **Janela** encaixadas na parede (pré-visualização sob o cursor, lado de abertura pelo cursor, `F` troca a dobradiça). Ficam "presas" à parede: acompanham quando ela é movida/esticada, deslizam ao arrastar e trocam de parede se soltas sobre outra; excluir a parede exclui as aberturas.
- **Cômodo**: modo *Detectar* (clique dentro de uma área fechada → grafo planar das paredes, menor face que contém o clique, área **útil** descontando meia espessura) e modo *Polígono*. Rótulo com nome + m², cor, perímetro, "Atualizar pelas paredes".
- **Texto** com edição no próprio canvas (duplo clique para editar; também renomeia cômodos).
- **Medir** (temporária, não salva).
- **Menu de contexto**, copiar/recortar/colar/duplicar (Ctrl+C/X/V/D).
- **Salvar/Abrir** (`.plankraft`, JSON) pelo main: grava só em caminhos escolhidos em diálogo nativo, gravação atômica, leitura validada/normalizada, indicador de não salvo, confirmação ao fechar (Salvar / Não salvar / Cancelar).
- Camada nova "Cômodos" e troca automática de camada por ferramenta (desligável nas Configurações).

## Etapa 3 — pronto
- Painel de Camadas: clique ativa, **duplo clique renomeia**, olho/cadeado, contador, % de opacidade, **arrastar para reordenar** (indicador de posição; a ordem vale para o canvas e valerá para o PDF).
- **Nova camada** (acima da ativa, já em modo de renomear), **duplicar** (com cópias dos objetos; portas duplicadas continuam na parede original), **excluir** com diálogo quando há objetos: *Mover para a camada vizinha* / *Excluir tudo* / *Cancelar*.
- Rodapé "Camada ativa": opacidade (slider), cor de destaque (paleta + cor livre), trazer para frente / enviar para trás, selecionar objetos da camada.
- Menu de contexto por camada; "Mover para a camada …" no menu do canvas e no painel de propriedades (inclusive seleção múltipla).
- Histórico: criar/renomear/cor/duplicar/excluir/reordenar/mover objetos podem ser desfeitos; visibilidade, bloqueio e opacidade são preferências de visualização e **não** são revertidas por Ctrl+Z.
- Chip da camada ativa na barra de opções das ferramentas de desenho (vermelho se bloqueada/oculta).
- Diálogo modal próprio (também usado em "alterações não salvas": Salvar / Descartar / Cancelar).

## Etapa 4 — pronto
- **Cotas associadas**: toda parede nova ganha uma cota (camada "Cotas") que acompanha a parede em tempo real e é excluída com ela; copiar/colar parede leva a cota junto.
- **Lado externo automático**: o grafo planar das paredes indica qual lado é "fora" da edificação; paredes internas/soltas usam o lado de cima/esquerda.
- **Diagonais**: cota paralela à parede, texto girado e nunca de cabeça para baixo.
- **Escalonamento**: cotas paralelas próximas se afastam em degraus (as mais longas ficam mais perto da parede).
- **Ângulos nos cantos** (ex.: 135°): só os diferentes de 90° por padrão, ou todos, ou nenhum.
- **Cota manual (K)**: arraste ou clique em 2 pontos (inclusive diagonais).
- Arrastar uma cota (Selecionar) muda o afastamento; duplo clique volta à posição automática.
- Configurações: mostrar/ocultar (**Ctrl+Shift+C**), estilo *Arquitetônico* (externo) ou *Linear simples* (sobre a parede), distância em px, criar cota ao desenhar, unidade e casas decimais.
- **Gerar cotas automáticas**: cria as cotas que faltam (paredes antigas, importações).
- Desenho 100% vetorial (Konva Line/Text) a partir do modelo — a mesma geometria (`lib/dimensions.ts`) será usada no PDF.

## Etapa 5 — pronto
- **Biblioteca de blocos** (aba Blocos): 32 símbolos vetoriais de fábrica em Sala, Quarto, Cozinha, Banheiro, Área externa e Genéricos; busca (ignora acentos), categorias colapsáveis, **favoritos** (★), seção "Deste projeto".
- **Inserir**: arrastar o cartão para o desenho, ou clicar nele e clicar no desenho (modo de inserção com fantasma; **R** gira, **Alt** sem encaixe, **Esc** sai). Vão para a camada "Móveis".
- **Encaixe em paredes**: perto de uma parede (ou invadindo-a), o bloco gira para encostar o fundo na face da parede e é posicionado colado a ela — ao inserir e ao arrastar.
- **Transformar**: alças para girar (snaps de 45°) e redimensionar (livre; **Shift** mantém proporção); **R / Shift+R** gira ±90°; espelhar H/V (menu de contexto e propriedades); tamanho exato em cm, rotação, cores de preenchimento e traço.
- **Instâncias de verdade**: cada inserção referencia o símbolo. **Salvar seleção como bloco** (nome, categoria, ícone; opcionalmente substitui a seleção por uma instância) e **Redefinir com a seleção atual** atualiza todas as instâncias.
- Biblioteca pessoal em `userData/block-library.json` (main, gravação atômica). O projeto guarda uma cópia dos blocos personalizados que usa, então abre em outro computador.
- Limitação: o desenho de um símbolo é editado por **redefinição** (desenhe as novas formas e use "Redefinir"); não há editor de símbolo dedicado.

## Etapa 6 — pronto
- **Importar imagem de fundo** (PNG/JPG; botão "Imagem", Arquivo → Importar, **Ctrl+I**): diálogo nativo no main; entra na camada "Imagem de Fundo", abaixo do desenho, com 60% de opacidade.
- **Definir escala (2 pontos)**: clique em dois pontos de medida conhecida e informe a distância real; o 1º ponto fica fixo. Também dá para digitar "1 pixel = N cm" ou a largura real.
- Mover, girar e redimensionar com as alças (proporção mantida); opacidade (slider), ocultar/bloquear; **Ctrl+B** mostra/oculta todas as imagens. Visibilidade, bloqueio e opacidade ficam fora do Ctrl+Z, como nas camadas.
- Imagem bloqueada não recebe clique; o card "Imagens de fundo" (painel direito, sem seleção) permite mostrar/desbloquear/selecionar.
- **Arquivo**: o JSON guarda só a referência; ao salvar, a imagem é copiada para `assets/` ao lado do `.plankraft`. Ao abrir, se o arquivo não existir, aparece um aviso e um contorno tracejado no lugar — o resto do projeto abre normalmente.

## Etapa 7 — pronto
- **Exportar PDF** (botão "PDF", Arquivo → Exportar, **Ctrl+P**): modal com papel (A4, A3, A2, Carta), orientação, escala (1:50, 1:100, 1:200 ou *Ajustar à página*), cotas, imagem de fundo (desmarcada por padrão), camadas a incluir, legenda e carimbo (projeto, autor, data). Miniatura da folha e aviso quando o desenho não cabe na escala escolhida. As opções ficam lembradas.
- **Vetorial de verdade**: o PDF é desenhado a partir do modelo com jsPDF (paredes, aberturas, cômodos, blocos, textos, cotas e ângulos em mm reais), na mesma ordem das camadas. Só a imagem de fundo é rasterizada (até ~200 dpi).
- **Quadro de áreas** (cômodos + área total) e **carimbo** com a escala efetiva.
- O arquivo é gravado pelo main (diálogo "Salvar como"); opcionalmente abre no visualizador padrão.

## Etapa 8 — pronto
- **Gerar com IA** (botão na barra, ou Ctrl+Enter no campo): descrição em linguagem natural + exemplos prontos; carregamento com tempo decorrido e **Cancelar**; **2–3 variações** em cartões com prévia, área e resumo; "Usar esta" substitui o desenho ou coloca ao lado (Ctrl+Z desfaz).
- **Chamada só no main**: Claude (`claude-opus-5-5`, padrão, via `@anthropic-ai/sdk` com saída estruturada validada por Zod e fallback do servidor em caso de recusa) ou OpenAI (`gpt-4o`, `json_schema` estrito). Erros traduzidos para mensagens amigáveis (chave recusada, limite de uso, sem internet, recusa, resposta inválida).
- A IA descreve **retângulos de cômodos**; o app deriva as paredes (externas 15 cm / internas 10 cm), posiciona portas e janelas nas paredes, calcula a área útil de cada cômodo, encaixa os móveis da biblioteca nas paredes e cria as cotas externas — tudo nas camadas certas.
- **Configurações → Inteligência artificial**: provedor, chave salva com `safeStorage` (criptografia do sistema) em `userData/ai-settings.json` — o renderer só vê "chave salva ····abcd" —, remover chave e **Testar conexão** (consulta o modelo, sem custo de geração).
- **Tour de boas-vindas** em 7 passos na primeira execução (desenho, camadas, blocos, imagem, cotas, PDF, IA); reabre em Ajuda → Tour de boas-vindas ou em Configurações.

### Modo offline (grátis) — padrão sem chave
- **Gerador procedural** (`src/shared/offlinePlanner.ts`): sem IA, sem internet e sem custo, resposta instantânea. Lê o pedido em português (área, quartos, suítes — inclusive "3 quartos (1 suíte)" / "sendo 2 suítes" —, banheiros, cozinha americana, varanda/gourmet, área de serviço, escritório, lavabo, garagem, studio), monta o programa de necessidades e distribui em faixas (social na frente, corredor, íntima nos fundos), escolhendo as profundidades por busca para equilibrar a casa e bater a área pedida.
- Entrega o mesmo formato da IA → reaproveita a montagem (paredes, portas, janelas, áreas úteis, móveis, cotas). Varandas ficam abertas (sem paredes externas).
- **3 variações** (clássica, espelhada, lote estreito); **"Gerar novamente"** rearranja quartos e fachada.
- Escolha em Configurações → Inteligência artificial → *Offline (grátis)* / Claude / OpenAI; o modal oferece "Usar offline" quando falta chave.

### Vista 3D
- Botões **2D / 3D / 2D+3D** na barra superior (também em Exibir). A maquete é gerada a partir do mesmo modelo, então acompanha as edições do 2D em tempo real.
- **three.js + @react-three/fiber + drei**, carregado sob demanda (não pesa a abertura do app). Paredes extrudadas (altura ajustável, padrão 2,70 m) divididas em volta dos vãos — portas com folha aberta, janelas com peitoril e vidro —, pisos na cor de cada cômodo, móveis da biblioteca em volume com alturas típicas, imagem de fundo opcional no chão.
- Câmera orbital (girar, aproximar, deslocar), vistas isométrica / topo / fachada frontal / ajustar, **corte das paredes a 1,20 m**, nomes e áreas dos cômodos, sombras e **exportar PNG**.
- Somente visualização; cotas e textos ficam no 2D.

## Próximos passos sugeridos
- Testar a geração com uma chave real (Claude e/ou OpenAI) e ajustar o prompt conforme a qualidade das plantas.
- Empacotar com `npm run dist:win` e definir ícone/instalador.
- Cômodos com vértices editáveis e atualização automática de área ao mover paredes.
- Vista 3D: modo "caminhar" em primeira pessoa e modelos 3D detalhados de móveis.
