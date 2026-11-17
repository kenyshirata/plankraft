# Créditos e licenças de terceiros

## Modelos 3D dos móveis e do exterior

Os modelos 3D da maquete vêm de fontes **CC0** (domínio público: uso livre, pessoal ou
comercial, sem obrigação de crédito, que é apreciado) e de modelos feitos para o projeto.
Os textos de licença estão em `src/renderer/src/assets/models/License-*.txt`.

| Origem | Modelos | Para que serve |
|---|---|---|
| [Kenney, Furniture Kit 2.0](https://kenney.nl/assets/furniture-kit) (CC0) | 48 | sofás, camas, cozinha, banheiro, escritório, mesa e cadeira (mesas de jantar compostas) etc. |
| [Kenney, Car Kit 3.1](https://kenney.nl/assets/car-kit) (CC0) | 1 (`sedan`) | bloco "Carro" |
| [Kenney, Nature Kit 2.1](https://kenney.nl/assets/nature-kit) (CC0) | 4 | árvores, arbusto e jardineira |
| [OpenGameArt, "fancy motorcycle"](https://opengameart.org/content/fancy-motorcycle) (Teh_Bucket, CC0) | 1 | moto (OBJ convertido para .glb, com cores nos materiais) |
| [OpenGameArt, "32 Low Poly Models"](https://opengameart.org/content/32-low-poly-models) (Drummyfish, CC0) | 1 (`bicycle.obj`) | bicicleta (OBJ convertido para .glb) |
| [Poly Haven, Stone Fire Pit](https://polyhaven.com/a/stone_fire_pit) (CC0) | 1 | churrasqueira (aproximada por uma fogueira de pedra) |
| [Poly Haven, Scandinavian Masonry Heater](https://polyhaven.com/a/scandinavian_masonry_heater) (CC0) | 1 | lareira (aproximada por um aquecedor de alvenaria) |
| **Feitos para o PlanKraft** (`tools/models/make_models.py`) | 4 | piano, aquário, esteira e berço (modelos simples gerados em código) |

- Os `.glb` estão em `src/renderer/src/assets/models/*.b64.txt` (o mesmo conteúdo, em base64,
  para carregar igual no app de desenvolvimento e no empacotado). Os modelos do Poly Haven
  foram reduzidos (textura de 512 px, sem mapas de normal e rugosidade).
- O mapeamento bloco → modelo (peças das mesas de jantar, alturas, giros e escala uniforme)
  está em `src/renderer/src/three/builtinModels.ts`.
- Blocos sem modelo (por exemplo, escadas, pilares e peças de arquitetura) continuam como volumes
  extrudados do símbolo 2D. O botão "Móveis detalhados" na barra 3D alterna entre os dois.

## Avaliado e não usado

- **Furniture Pack (Quaternius, CC0)**, no OpenGameArt: só traz `.obj`, `.fbx` e `.blend`
  (sem glTF) e seus itens (cama, estante, sofá, mesa…) já são cobertos pelo Furniture Kit.
