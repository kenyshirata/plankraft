/**
 * Contrato da geração de plantas por IA (compartilhado entre main e renderer).
 *
 * A IA descreve cada variação como RETÂNGULOS de cômodos (em metros) num grid
 * comum, mais pontos de portas/janelas e móveis da biblioteca. O app deriva as
 * paredes, aberturas, áreas úteis e cotas — assim a geometria fica sempre
 * consistente, mesmo que a IA erre um pouco as coordenadas.
 */
import * as z from 'zod/v4'

/** Móveis que a IA pode sugerir (ids da biblioteca de fábrica). */
export const AI_FURNITURE: Record<string, string> = {
  'builtin:sofa-3': 'sofá 3 lugares (210×90 cm)',
  'builtin:sofa-2': 'sofá 2 lugares (160×90 cm)',
  'builtin:armchair': 'poltrona (80×80 cm)',
  'builtin:coffee-table': 'mesa de centro (100×60 cm)',
  'builtin:tv-rack': 'rack de TV (180×45 cm)',
  'builtin:bed-single': 'cama de solteiro (88×188 cm)',
  'builtin:bed-double': 'cama de casal (138×188 cm)',
  'builtin:bed-queen': 'cama queen (158×198 cm)',
  'builtin:wardrobe': 'guarda-roupa (200×60 cm)',
  'builtin:nightstand': 'criado-mudo (45×40 cm)',
  'builtin:desk': 'escrivaninha com cadeira (120×60 cm)',
  'builtin:kitchen-sink': 'pia de cozinha (120×60 cm)',
  'builtin:stove': 'fogão (60×60 cm)',
  'builtin:fridge': 'geladeira (70×70 cm)',
  'builtin:dining-4': 'mesa de jantar 4 lugares com cadeiras (120×160 cm)',
  'builtin:dining-6': 'mesa de jantar 6 lugares com cadeiras (180×160 cm)',
  'builtin:toilet': 'vaso sanitário (40×68 cm)',
  'builtin:bath-sink': 'lavatório (60×45 cm)',
  'builtin:shower': 'box de chuveiro (90×90 cm)',
  'builtin:bathtub': 'banheira (170×75 cm)',
  'builtin:round-table': 'mesa redonda (Ø100 cm)',
  'builtin:garden-chair': 'cadeira de jardim (55×60 cm)',
  'builtin:bbq': 'churrasqueira (100×60 cm)'
}

const FURNITURE_IDS = Object.keys(AI_FURNITURE) as [string, ...string[]]

const ROOM_TYPES = [
  'sala',
  'cozinha',
  'sala_cozinha',
  'quarto',
  'suite',
  'banheiro',
  'lavabo',
  'varanda',
  'area_servico',
  'circulacao',
  'escritorio',
  'garagem',
  'outro'
] as const

const AiRoom = z.object({
  name: z.string().describe('Nome do cômodo em português, ex.: "Sala de estar", "Quarto 1", "Suíte"'),
  type: z.enum(ROOM_TYPES),
  x: z.number().describe('Canto superior esquerdo, em metros (eixo X para a direita)'),
  y: z.number().describe('Canto superior esquerdo, em metros (eixo Y para baixo)'),
  width: z.number().describe('Largura em metros (eixo X)'),
  depth: z.number().describe('Profundidade em metros (eixo Y)')
})

const AiOpening = z.object({
  x: z.number().describe('Centro do vão, em metros, exatamente sobre a linha de uma parede'),
  y: z.number(),
  width: z.number().describe('Largura do vão em metros (portas 0.7–0.9; janelas 0.6–2.0)')
})

const AiFurniture = z.object({
  block: z.enum(FURNITURE_IDS),
  x: z.number().describe('Centro do móvel em metros'),
  y: z.number(),
  rotation: z.number().describe('Rotação em graus (0, 90, 180 ou 270). 0 = encosto/cabeceira voltado para cima (−Y)')
})

export const AiVariant = z.object({
  title: z.string().describe('Título curto da variação, ex.: "Social integrado"'),
  summary: z.string().describe('Uma frase explicando a ideia do layout'),
  rooms: z.array(AiRoom),
  doors: z.array(AiOpening),
  windows: z.array(AiOpening),
  furniture: z.array(AiFurniture)
})

export const AiPlanResponse = z.object({
  variants: z.array(AiVariant).describe('De 2 a 3 variações de layout diferentes')
})

export type AiVariantT = z.infer<typeof AiVariant>
export type AiPlanResponseT = z.infer<typeof AiPlanResponse>

/** Instruções de sistema (fixas → também aproveitam cache de prompt). */
export const AI_SYSTEM_PROMPT = `Você é um arquiteto experiente que cria plantas baixas residenciais brasileiras.
Responda SOMENTE no formato JSON pedido. Gere de 2 a 3 VARIAÇÕES realmente diferentes de layout para o pedido do usuário.

Regras de geometria (obrigatórias):
- Unidades em METROS. Origem (0,0) no canto superior esquerdo; X cresce para a direita e Y para baixo.
- Cada cômodo é um retângulo (x, y, width, depth). Os retângulos se ENCOSTAM sem sobreposição e sem frestas; a união forma o contorno da casa.
- Use coordenadas múltiplas de 0.05 m. Cômodos vizinhos compartilham exatamente a mesma coordenada de borda.
- A soma das áreas deve ficar próxima da área pedida (±10%). Dimensões mínimas: quartos ≥ 2.6 m de lado, banheiros ≥ 1.2 × 1.8 m, circulação ≥ 0.9 m de largura.
- "sala_cozinha" representa cozinha americana/integrada (um único retângulo).
- Portas: centro EXATAMENTE sobre a borda compartilhada entre dois cômodos (ou na borda externa para a porta de entrada), longe dos cantos (≥ 0.3 m). Todo cômodo precisa ser acessível. Inclua uma porta de entrada na fachada.
- Janelas: centro sobre bordas EXTERNAS; cada quarto, sala e cozinha tem ao menos uma.
- Móveis: use apenas os ids permitidos, dentro do cômodo correto, sem bloquear portas. Rotação 0 = encosto/cabeceira para cima (−Y), 90 = para a direita (+X), 180 = para baixo, 270 = para a esquerda. Encoste camas, sofás, pias e vasos em paredes.

Móveis permitidos:
${Object.entries(AI_FURNITURE)
  .map(([id, d]) => `- ${id}: ${d}`)
  .join('\n')}

Escreva títulos, nomes e resumos em português do Brasil.`
