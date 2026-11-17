# Créditos e licenças de terceiros

## Modelos 3D dos móveis e do exterior

Todos os modelos 3D da maquete vêm de pacotes de **Kenney** ([kenney.nl](https://kenney.nl)),
licenciados em **Creative Commons Zero (CC0)** — uso livre, pessoal ou comercial, sem obrigação
de crédito (o crédito é apreciado). Os textos de licença originais estão em
`src/renderer/src/assets/models/License-*.txt`.

| Pacote | Modelos usados | Para que serve |
|---|---|---|
| [Furniture Kit 2.0](https://kenney.nl/assets/furniture-kit) | 48 | sofás, camas, cozinha, banheiro, escritório, mesa e cadeira (mesas de jantar compostas) etc. |
| [Car Kit 3.1](https://kenney.nl/assets/car-kit) | 1 (`sedan`) | bloco "Carro" |
| [Nature Kit 2.1](https://kenney.nl/assets/nature-kit) | 4 (`tree_oak`, `tree_small`, `plant_bushLarge`, `pot_large`) | árvores, arbusto e jardineira |

- Os `.glb` originais estão em `src/renderer/src/assets/models/*.b64.txt` (o mesmo conteúdo,
  em base64, para carregar igual no app de desenvolvimento e no empacotado).
- O mapeamento bloco → modelo (inclusive as peças das mesas de jantar, alturas e giros) está em
  `src/renderer/src/three/builtinModels.ts`.
- Blocos sem modelo (piano, lareira, aquário, esteira, bicicleta, moto, berço, churrasqueira…)
  continuam como volumes simples extrudados do símbolo 2D. O botão "Móveis detalhados" na
  barra 3D alterna entre os dois.

## Avaliado e não usado

- **Furniture Pack (Quaternius, CC0)**, no OpenGameArt: só traz `.obj`, `.fbx` e `.blend`
  (sem glTF) e seus itens (cama, estante, sofá, mesa…) já são cobertos pelo Furniture Kit.
