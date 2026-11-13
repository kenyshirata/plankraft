/**
 * Símbolos de fábrica (vetoriais, em cm). Convenção: fundo/encosto em Y=0,
 * frente para +Y — é o lado Y=0 que encosta na parede no encaixe automático.
 * Medidas baseadas em dimensões comerciais comuns no Brasil.
 */
import type { BlockDef, BlockShape } from '@shared/blocks'
import { DEFAULT_STAIR, stairDef } from '@shared/stairs'

type Opt = Partial<Pick<Extract<BlockShape, { kind: 'rect' }>, 'fill' | 'dash' | 'weight' | 'r'>>
const R = (x: number, y: number, w: number, h: number, o: Opt = {}): BlockShape => ({ kind: 'rect', x, y, w, h, fill: 'fill', ...o })
const E = (cx: number, cy: number, rx: number, ry: number, o: Omit<Opt, 'r'> = {}): BlockShape => ({ kind: 'ellipse', cx, cy, rx, ry, fill: 'fill', ...o })
const P = (points: number[], closed = false, o: Omit<Opt, 'r'> = {}): BlockShape => ({ kind: 'poly', points, closed, fill: closed ? 'fill' : 'none', ...o })
const L = (x1: number, y1: number, x2: number, y2: number, o: Omit<Opt, 'r'> = {}): BlockShape => P([x1, y1, x2, y2], false, o)
const A = (cx: number, cy: number, r: number, start: number, end: number, o: Omit<Opt, 'r'> = {}): BlockShape => ({ kind: 'arc', cx, cy, r, start, end, fill: 'none', ...o })

function def(id: string, name: string, category: string, width: number, height: number, shapes: BlockShape[]): BlockDef {
  return { id: `builtin:${id}`, name, category, width, height, shapes, builtin: true }
}

// ---------------------------------------------------------------- helpers


/** Sofá com N assentos: encosto atrás, braços laterais, almofadas. */
function sofa(seats: number, width: number, depth = 90): BlockShape[] {
  const arm = 18
  const back = 20
  const seatW = (width - 2 * arm) / seats
  const shapes: BlockShape[] = [R(0, 0, width, depth, { r: 8 }), R(0, 0, width, back, { r: 6 }), R(0, 0, arm, depth, { r: 6 }), R(width - arm, 0, arm, depth, { r: 6 })]
  for (let i = 0; i < seats; i++) shapes.push(R(arm + i * seatW + 2, back + 2, seatW - 4, depth - back - 6, { r: 5 }))
  return shapes
}

/** Cama: estrutura, travesseiros e dobra do lençol. */
function bed(width: number, length: number, pillows: number): BlockShape[] {
  const shapes: BlockShape[] = [R(0, 0, width, length, { r: 3 }), R(0, 0, width, 8, { fill: 'ink', weight: 0 })]
  const gap = 8
  const pw = (width - gap * (pillows + 1)) / pillows
  for (let i = 0; i < pillows; i++) shapes.push(R(gap + i * (pw + gap), 14, pw, 30, { r: 8 }))
  const fold = 60
  shapes.push(L(0, fold, width, fold), P([width - 45, fold, width, fold + 45, width, fold], true, { fill: 'none' }))
  return shapes
}

/** Cadeira simples (encosto atrás). */
function chairShapes(x: number, y: number, w = 45, d = 45, rotate180 = false): BlockShape[] {
  if (!rotate180) return [R(x, y + 6, w, d - 6, { r: 4 }), R(x + 2, y, w - 4, 8, { r: 3 })]
  return [R(x, y, w, d - 6, { r: 4 }), R(x + 2, y + d - 8, w - 4, 8, { r: 3 })]
}

// ---------------------------------------------------------------- catálogo

export const BUILTIN_BLOCKS: BlockDef[] = [
  // ---------------------------------------------------------------- Sala
  def('sofa-3', 'Sofá 3 lugares', 'Sala', 210, 90, sofa(3, 210)),
  def('sofa-2', 'Sofá 2 lugares', 'Sala', 160, 90, sofa(2, 160)),
  def('armchair', 'Poltrona', 'Sala', 80, 80, sofa(1, 80, 80)),
  def('coffee-table', 'Mesa de centro', 'Sala', 100, 60, [R(0, 0, 100, 60, { r: 4 }), R(6, 6, 88, 48, { r: 3, fill: 'none', weight: 0.6 })]),
  def('tv-rack', 'Rack', 'Sala', 180, 45, [R(0, 0, 180, 45, { r: 2 }), L(60, 0, 60, 45, { weight: 0.6 }), L(120, 0, 120, 45, { weight: 0.6 }), E(30, 38, 2, 2, { fill: 'ink', weight: 0 }), E(150, 38, 2, 2, { fill: 'ink', weight: 0 })]),
  def('tv', 'TV', 'Sala', 120, 22, [R(0, 0, 120, 6, { fill: 'ink' }), R(40, 6, 40, 4), R(30, 10, 60, 12, { r: 2 })]),

  // ---------------------------------------------------------------- Quarto
  def('bed-single', 'Cama de solteiro', 'Quarto', 88, 188, bed(88, 188, 1)),
  def('bed-double', 'Cama de casal', 'Quarto', 138, 188, bed(138, 188, 2)),
  def('bed-queen', 'Cama queen', 'Quarto', 158, 198, bed(158, 198, 2)),
  def('bed-king', 'Cama king', 'Quarto', 193, 203, bed(193, 203, 2)),
  def('wardrobe', 'Guarda-roupa', 'Quarto', 200, 60, [
    R(0, 0, 200, 60, { r: 1 }),
    L(66.6, 0, 66.6, 60, { weight: 0.6 }),
    L(133.3, 0, 133.3, 60, { weight: 0.6 }),
    L(4, 28, 196, 28, { dash: true, weight: 0.7 }),
    P([60, 54, 66.6, 46, 73, 54], false, { weight: 0.6 }),
    P([126.6, 54, 133.3, 46, 140, 54], false, { weight: 0.6 })
  ]),
  def('nightstand', 'Criado-mudo', 'Quarto', 45, 40, [R(0, 0, 45, 40, { r: 2 }), L(4, 20, 41, 20, { weight: 0.6 }), E(22.5, 30, 2.5, 2.5, { fill: 'ink', weight: 0 })]),
  def('desk', 'Escrivaninha', 'Quarto', 120, 60, [R(0, 0, 120, 60, { r: 2 }), R(84, 4, 32, 52, { fill: 'none', weight: 0.6 }), L(84, 22, 116, 22, { weight: 0.6 }), L(84, 40, 116, 40, { weight: 0.6 }), ...chairShapes(30, 50, 46, 46, true)]),

  // ---------------------------------------------------------------- Cozinha
  def('kitchen-sink', 'Pia de cozinha', 'Cozinha', 120, 60, [
    R(0, 0, 120, 60, { r: 1 }),
    R(15, 10, 55, 42, { r: 6, fill: 'none' }),
    E(42.5, 31, 3, 3, { fill: 'none', weight: 0.8 }),
    R(78, 10, 32, 42, { r: 3, fill: 'none', weight: 0.6, dash: true }),
    L(42.5, 3, 42.5, 12, { weight: 1.4 })
  ]),
  def('stove', 'Fogão 4 bocas', 'Cozinha', 60, 60, [
    R(0, 0, 60, 60, { r: 2 }),
    R(0, 0, 60, 8, { fill: 'none', weight: 0.7 }),
    E(18, 24, 9, 9, { fill: 'none' }), E(42, 24, 9, 9, { fill: 'none' }), E(18, 46, 9, 9, { fill: 'none' }), E(42, 46, 9, 9, { fill: 'none' }),
    E(18, 24, 3, 3, { fill: 'ink', weight: 0 }), E(42, 24, 3, 3, { fill: 'ink', weight: 0 }), E(18, 46, 3, 3, { fill: 'ink', weight: 0 }), E(42, 46, 3, 3, { fill: 'ink', weight: 0 })
  ]),
  def('fridge', 'Geladeira', 'Cozinha', 70, 70, [R(0, 0, 70, 70, { r: 3 }), L(0, 62, 70, 62, { weight: 0.7 }), L(6, 66, 30, 66, { weight: 1.4 }), L(14, 14, 56, 56, { weight: 0.5 }), L(56, 14, 14, 56, { weight: 0.5 })]),
  def('microwave', 'Micro-ondas', 'Cozinha', 50, 35, [R(0, 0, 50, 35, { r: 2 }), R(4, 6, 32, 25, { r: 2, fill: 'none', weight: 0.7 }), E(43, 12, 2, 2, { fill: 'none', weight: 0.7 }), E(43, 21, 2, 2, { fill: 'none', weight: 0.7 })]),
  def('dining-4', 'Mesa de jantar (4 lugares)', 'Cozinha', 120, 160, [
    ...chairShapes(15, 0), ...chairShapes(60, 0),
    R(0, 35, 120, 90, { r: 3 }),
    ...chairShapes(15, 115, 45, 45, true), ...chairShapes(60, 115, 45, 45, true)
  ]),
  def('dining-6', 'Mesa de jantar (6 lugares)', 'Cozinha', 180, 160, [
    ...chairShapes(15, 0), ...chairShapes(68, 0), ...chairShapes(121, 0),
    R(0, 35, 180, 90, { r: 3 }),
    ...chairShapes(15, 115, 45, 45, true), ...chairShapes(68, 115, 45, 45, true), ...chairShapes(121, 115, 45, 45, true)
  ]),
  def('chair', 'Cadeira', 'Cozinha', 45, 45, chairShapes(0, 0)),

  // ---------------------------------------------------------------- Banheiro
  def('toilet', 'Vaso sanitário', 'Banheiro', 40, 68, [R(2, 0, 36, 18, { r: 3 }), E(20, 44, 18, 24), E(20, 46, 12, 16, { fill: 'none', weight: 0.7 })]),
  def('bath-sink', 'Pia (lavatório)', 'Banheiro', 60, 45, [R(0, 0, 60, 45, { r: 3 }), E(30, 25, 21, 15, { fill: 'none' }), E(30, 28, 2.5, 2.5, { fill: 'none', weight: 0.7 }), L(30, 3, 30, 12, { weight: 1.4 })]),
  def('shower', 'Box de chuveiro', 'Banheiro', 90, 90, [R(0, 0, 90, 90), R(4, 4, 82, 82, { fill: 'none', weight: 0.6 }), L(4, 4, 86, 86, { dash: true, weight: 0.5 }), L(86, 4, 4, 86, { dash: true, weight: 0.5 }), E(45, 45, 4, 4, { fill: 'none' }), E(45, 10, 5, 3, { fill: 'ink', weight: 0 })]),
  def('bathtub', 'Banheira', 'Banheiro', 170, 75, [R(0, 0, 170, 75, { r: 4 }), R(8, 8, 154, 59, { r: 24, fill: 'none' }), E(150, 37.5, 3.5, 3.5, { fill: 'none', weight: 0.8 })]),

  // ---------------------------------------------------------------- Área externa
  def('round-table', 'Mesa redonda', 'Área externa', 100, 100, [E(50, 50, 50, 50), E(50, 50, 4, 4, { fill: 'none', weight: 0.6 })]),
  def('garden-chair', 'Cadeira de jardim', 'Área externa', 55, 60, [R(0, 8, 55, 52, { r: 10 }), R(4, 0, 47, 12, { r: 6 }), L(6, 20, 6, 54, { weight: 0.6 }), L(49, 20, 49, 54, { weight: 0.6 })]),
  def('lounger', 'Espreguiçadeira', 'Área externa', 70, 190, [R(0, 0, 70, 190, { r: 8 }), R(4, 4, 62, 55, { r: 6, fill: 'none', weight: 0.7 }), ...[80, 100, 120, 140, 160].map((y) => L(6, y, 64, y, { weight: 0.5 }))]),
  def('bbq', 'Churrasqueira', 'Área externa', 100, 60, [R(0, 0, 100, 60, { r: 2 }), R(10, 8, 80, 40, { fill: 'none' }), ...[18, 26, 34, 42, 50, 58, 66, 74, 82].map((x) => L(x, 10, x, 46, { weight: 0.5 }))]),

  // ---------------------------------------------------------------- Genéricos
  // ---------------------------------------------------------------- Sala (mais)
  def('sofa-l', 'Sofá em L', 'Sala', 250, 160, [
    P([0, 0, 250, 0, 250, 90, 90, 90, 90, 160, 0, 160], true),
    R(0, 0, 250, 20, { r: 6, fill: 'none', weight: 0.6 }),
    R(0, 0, 20, 160, { r: 6, fill: 'none', weight: 0.6 }),
    L(90, 20, 90, 90, { weight: 0.6 }), L(170, 20, 170, 90, { weight: 0.6 }), L(20, 90, 90, 90, { weight: 0.6 }), L(20, 125, 90, 125, { weight: 0.6 })
  ]),
  def('puff', 'Puff', 'Sala', 55, 55, [E(27.5, 27.5, 27.5, 27.5), E(27.5, 27.5, 17, 17, { fill: 'none', weight: 0.6 })]),
  def('side-table', 'Mesa lateral', 'Sala', 50, 50, [R(0, 0, 50, 50, { r: 4 }), R(6, 6, 38, 38, { r: 3, fill: 'none', weight: 0.6 })]),
  def('bookshelf', 'Estante', 'Sala', 120, 35, [R(0, 0, 120, 35, { r: 1 }), L(40, 0, 40, 35, { weight: 0.6 }), L(80, 0, 80, 35, { weight: 0.6 }), L(0, 6, 120, 6, { weight: 0.5 })]),
  def('sideboard', 'Aparador', 'Sala', 160, 45, [R(0, 0, 160, 45, { r: 2 }), L(40, 4, 40, 45, { weight: 0.6 }), L(80, 4, 80, 45, { weight: 0.6 }), L(120, 4, 120, 45, { weight: 0.6 })]),
  def('rug', 'Tapete', 'Sala', 200, 300, [R(0, 0, 200, 300, { r: 4, dash: true }), R(14, 14, 172, 272, { fill: 'none', dash: true, weight: 0.6 })]),
  def('piano', 'Piano', 'Sala', 150, 60, [R(0, 0, 150, 60, { r: 3 }), R(6, 34, 138, 22, { fill: 'none', weight: 0.6 }), ...Array.from({ length: 11 }, (_, i) => L(6 + (i + 1) * 11.5, 34, 6 + (i + 1) * 11.5, 56, { weight: 0.4 }))]),
  def('fireplace', 'Lareira', 'Sala', 120, 40, [R(0, 0, 120, 40, { r: 2 }), R(20, 8, 80, 28, { fill: 'none', weight: 0.7 }), L(30, 36, 60, 14, { weight: 0.5 }), L(90, 36, 60, 14, { weight: 0.5 })]),
  def('plant-pot', 'Vaso de planta', 'Sala', 45, 45, [E(22.5, 22.5, 22.5, 22.5), E(22.5, 22.5, 14, 14, { fill: 'none', weight: 0.6 }), L(22.5, 22.5, 10, 10, { weight: 0.5 }), L(22.5, 22.5, 36, 12, { weight: 0.5 }), L(22.5, 22.5, 30, 36, { weight: 0.5 })]),
  def('floor-lamp', 'Luminária de piso', 'Sala', 32, 32, [E(16, 16, 16, 16), E(16, 16, 6, 6, { fill: 'ink' })]),
  def('dining-8', 'Mesa de jantar (8 lugares)', 'Cozinha', 240, 160, [
    ...[15, 68, 121, 174].flatMap((x) => chairShapes(x, 0)),
    R(0, 35, 240, 90, { r: 3 }),
    ...[15, 68, 121, 174].flatMap((x) => chairShapes(x, 115, 45, 45, true))
  ]),
  // ---------------------------------------------------------------- Quarto (mais)
  def('bunk-bed', 'Beliche', 'Quarto', 90, 200, [...bed(90, 200, 1), R(2, 2, 6, 196, { fill: 'ink', weight: 0 }), R(82, 2, 6, 196, { fill: 'ink', weight: 0 })]),
  def('crib', 'Berço', 'Quarto', 70, 130, [R(0, 0, 70, 130, { r: 3 }), R(6, 6, 58, 118, { r: 2, fill: 'none', weight: 0.6 }), ...Array.from({ length: 7 }, (_, i) => L(0, 14 + i * 17, 6, 14 + i * 17, { weight: 0.5 }))]),
  def('dresser', 'Cômoda', 'Quarto', 120, 45, [R(0, 0, 120, 45, { r: 2 }), L(40, 4, 40, 45, { weight: 0.6 }), L(80, 4, 80, 45, { weight: 0.6 }), E(20, 30, 2, 2, { fill: 'ink' }), E(60, 30, 2, 2, { fill: 'ink' }), E(100, 30, 2, 2, { fill: 'ink' })]),
  def('vanity', 'Penteadeira', 'Quarto', 100, 45, [R(0, 0, 100, 45, { r: 2 }), R(30, 0, 40, 6, { fill: 'ink', weight: 0 }), E(50, 70, 0.1, 0.1, { fill: 'none', weight: 0 }), R(0, 0, 100, 45, { fill: 'none', weight: 0.7, r: 2 })]),
  def('chest', 'Baú / banco de cama', 'Quarto', 100, 45, [R(0, 0, 100, 45, { r: 3 }), L(0, 12, 100, 12, { weight: 0.6 })]),
  // ---------------------------------------------------------------- Cozinha (mais)
  def('kitchen-island', 'Ilha de cozinha', 'Cozinha', 200, 90, [R(0, 0, 200, 90, { r: 3 }), R(120, 10, 70, 70, { r: 6, fill: 'none', weight: 0.7 }), E(155, 45, 8, 8, { fill: 'none', weight: 0.7 })]),
  def('washer', 'Máquina de lavar', 'Cozinha', 60, 65, [R(0, 0, 60, 65, { r: 3 }), E(30, 38, 20, 20, { fill: 'none', weight: 0.7 }), E(30, 38, 12, 12, { fill: 'none', weight: 0.5 }), R(4, 4, 52, 10, { fill: 'none', weight: 0.5 })]),
  def('dishwasher', 'Lava-louças', 'Cozinha', 60, 60, [R(0, 0, 60, 60, { r: 2 }), L(0, 10, 60, 10, { weight: 0.6 }), L(10, 6, 50, 6, { weight: 1.4 }), L(6, 22, 54, 54, { weight: 0.4 }), L(54, 22, 6, 54, { weight: 0.4 })]),
  def('counter', 'Bancada', 'Cozinha', 150, 60, [R(0, 0, 150, 60, { r: 2 }), L(50, 0, 50, 60, { weight: 0.6 }), L(100, 0, 100, 60, { weight: 0.6 })]),
  def('pantry', 'Armário / despensa', 'Cozinha', 60, 60, [R(0, 0, 60, 60, { r: 2 }), L(0, 0, 60, 60, { weight: 0.5 }), L(60, 0, 0, 60, { weight: 0.5 })]),
  def('cooktop-island', 'Ilha com cooktop', 'Cozinha', 180, 90, [R(0, 0, 180, 90, { r: 3 }), E(40, 30, 10, 10, { fill: 'none', weight: 0.7 }), E(70, 30, 10, 10, { fill: 'none', weight: 0.7 }), E(40, 60, 10, 10, { fill: 'none', weight: 0.7 }), E(70, 60, 10, 10, { fill: 'none', weight: 0.7 })]),
  // ---------------------------------------------------------------- Banheiro (mais)
  def('double-sink', 'Bancada dupla', 'Banheiro', 140, 50, [R(0, 0, 140, 50, { r: 3 }), E(35, 27, 20, 14, { fill: 'none', weight: 0.7 }), E(105, 27, 20, 14, { fill: 'none', weight: 0.7 }), E(35, 8, 2, 2, { fill: 'ink' }), E(105, 8, 2, 2, { fill: 'ink' })]),
  def('bidet', 'Bidê', 'Banheiro', 40, 55, [R(0, 0, 40, 12, { r: 3 }), E(20, 33, 17, 22, { fill: 'fill' }), E(20, 36, 9, 13, { fill: 'none', weight: 0.6 })]),
  def('laundry-tub', 'Tanque', 'Banheiro', 60, 55, [R(0, 0, 60, 55, { r: 3 }), R(6, 6, 48, 38, { r: 4, fill: 'none', weight: 0.7 }), E(30, 25, 3, 3, { fill: 'ink' })]),
  // ---------------------------------------------------------------- Escritório
  def('desk-l', 'Mesa em L', 'Escritório', 160, 140, [P([0, 0, 160, 0, 160, 60, 60, 60, 60, 140, 0, 140], true), ...chairShapes(85, 78, 45, 45, true).slice(0, 2)]),
  def('office-chair', 'Cadeira de escritório', 'Escritório', 58, 58, [E(29, 29, 27, 27), R(10, 4, 38, 12, { r: 5 }), E(29, 32, 12, 12, { fill: 'none', weight: 0.6 })]),
  def('file-cabinet', 'Arquivo', 'Escritório', 45, 60, [R(0, 0, 45, 60, { r: 2 }), L(0, 20, 45, 20, { weight: 0.6 }), L(0, 40, 45, 40, { weight: 0.6 }), L(15, 10, 30, 10, { weight: 1.2 })]),
  def('shelf-office', 'Estante de escritório', 'Escritório', 90, 35, [R(0, 0, 90, 35, { r: 1 }), L(30, 0, 30, 35, { weight: 0.6 }), L(60, 0, 60, 35, { weight: 0.6 })]),
  // ---------------------------------------------------------------- Garagem e lazer
  def('bicycle', 'Bicicleta', 'Garagem e lazer', 180, 60, [E(30, 30, 28, 28, { fill: 'none' }), E(150, 30, 28, 28, { fill: 'none' }), L(30, 30, 90, 30, { weight: 1 }), L(90, 30, 70, 12, { weight: 1 }), L(70, 12, 140, 18, { weight: 1 }), L(140, 18, 150, 30, { weight: 1 }), L(60, 8, 80, 8, { weight: 1.4 })]),
  def('motorcycle', 'Moto', 'Garagem e lazer', 200, 80, [R(0, 25, 200, 30, { r: 14 }), E(30, 40, 26, 14, { fill: 'ink' }), E(170, 40, 26, 14, { fill: 'ink' }), R(70, 18, 60, 44, { r: 10 })]),
  def('treadmill', 'Esteira', 'Garagem e lazer', 80, 170, [R(0, 0, 80, 170, { r: 4 }), R(10, 30, 60, 130, { r: 3, fill: 'none', weight: 0.7 }), R(8, 4, 64, 20, { r: 3, fill: 'none', weight: 0.7 })]),
  def('aquarium', 'Aquário', 'Sala', 100, 40, [R(0, 0, 100, 40, { r: 2 }), R(5, 5, 90, 30, { r: 2, fill: 'none', weight: 0.6 }), P([15, 22, 25, 18, 35, 22, 45, 18, 55, 22, 65, 18, 75, 22, 85, 18], false, { weight: 0.5 })]),
  def('wardrobe-wide', 'Guarda-roupa grande', 'Quarto', 240, 60, [R(0, 0, 240, 60, { r: 1 }), L(60, 0, 60, 60, { weight: 0.6 }), L(120, 0, 120, 60, { weight: 0.6 }), L(180, 0, 180, 60, { weight: 0.6 }), L(20, 12, 100, 48, { weight: 0.3 }), L(140, 12, 220, 48, { weight: 0.3 })]),
  def('planter', 'Jardineira', 'Jardim', 100, 40, [R(0, 0, 100, 40, { r: 3 }), E(20, 20, 11, 11, { fill: 'none', weight: 0.6 }), E(50, 20, 11, 11, { fill: 'none', weight: 0.6 }), E(80, 20, 11, 11, { fill: 'none', weight: 0.6 })]),
  def('tree', 'Árvore', 'Jardim', 300, 300, [E(150, 150, 150, 150, { dash: true }), E(150, 150, 24, 24, { fill: 'ink' }), L(150, 150, 60, 80, { weight: 0.4 }), L(150, 150, 240, 90, { weight: 0.4 }), L(150, 150, 210, 250, { weight: 0.4 }), L(150, 150, 80, 230, { weight: 0.4 })]),
  def('tree-small', 'Árvore pequena', 'Jardim', 160, 160, [E(80, 80, 80, 80, { dash: true }), E(80, 80, 14, 14, { fill: 'ink' }), L(80, 80, 30, 40, { weight: 0.4 }), L(80, 80, 130, 50, { weight: 0.4 }), L(80, 80, 110, 135, { weight: 0.4 })]),
  def('shrub', 'Arbusto', 'Jardim', 80, 80, [E(40, 40, 40, 40, { dash: true }), E(40, 40, 22, 22, { fill: 'none' }), E(40, 40, 8, 8, { fill: 'none' })]),
  def('garden-bench', 'Banco de jardim', 'Jardim', 150, 45, [R(0, 0, 150, 45, { r: 4 }), R(0, 0, 150, 12, { r: 3 }), L(0, 24, 150, 24, { weight: 0.5 }), L(0, 34, 150, 34, { weight: 0.5 })]),
  def('car', 'Carro', 'Jardim', 180, 450, [R(0, 0, 180, 450, { r: 36 }), R(20, 110, 140, 90, { r: 14 }), R(20, 210, 140, 100, { r: 10 }), R(26, 316, 128, 60, { r: 14 }), R(6, 70, 20, 40, { r: 6, fill: 'ink' }), R(154, 70, 20, 40, { r: 6, fill: 'ink' })]),
  def('pillar-rect', 'Pilar quadrado', 'Estrutura', 30, 30, [R(0, 0, 30, 30), L(0, 0, 30, 30, { weight: 0.5 }), L(30, 0, 0, 30, { weight: 0.5 })]),
  def('pillar-round', 'Pilar redondo', 'Estrutura', 30, 30, [E(15, 15, 15, 15), L(3, 3, 27, 27, { weight: 0.5 }), L(27, 3, 3, 27, { weight: 0.5 })]),
  stairDef(DEFAULT_STAIR),
  stairDef({ ...DEFAULT_STAIR, shape: 'L' }),
  stairDef({ ...DEFAULT_STAIR, shape: 'U' }),
  def('circle', 'Círculo', 'Genéricos', 100, 100, [E(50, 50, 50, 50)]),
  def('rectangle', 'Retângulo', 'Genéricos', 100, 60, [R(0, 0, 100, 60)]),
  def('door-std', 'Porta padrão', 'Genéricos', 80, 80, [L(0, 0, 0, 80, { weight: 1.6 }), A(0, 0, 80, 0, 90, { dash: true, weight: 0.7 }), L(0, 0, 80, 0, { weight: 0.6 })]),
  def('north-arrow', 'Seta de norte', 'Genéricos', 60, 80, [
    E(30, 50, 28, 28, { fill: 'none' }),
    P([30, 18, 42, 62, 30, 54], true, { fill: 'ink' }),
    P([30, 18, 18, 62, 30, 54], true, { fill: 'none' }),
    { kind: 'text', x: 30, y: 0, text: 'N', size: 14, align: 'center', fill: 'ink' }
  ])
]

/** Ordem de exibição das categorias de fábrica. */
export const BUILTIN_CATEGORIES = ['Sala', 'Quarto', 'Cozinha', 'Banheiro', 'Escritório', 'Garagem e lazer', 'Área externa', 'Jardim', 'Escada', 'Estrutura', 'Genéricos']

export const BUILTIN_BY_ID = new Map(BUILTIN_BLOCKS.map((b) => [b.id, b]))
