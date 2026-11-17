# Créditos e licenças de terceiros

## Modelos 3D dos móveis

Os 40 modelos 3D usados na maquete (sofás, camas, cozinha, banheiro etc.) vêm do
**Furniture Kit (2.0)**, de **Kenney** — [kenney.nl/assets/furniture-kit](https://kenney.nl/assets/furniture-kit).

- Licença: **Creative Commons Zero (CC0)** — uso livre, pessoal ou comercial, sem obrigação
  de crédito (o crédito é apreciado). Texto original em
  `src/renderer/src/assets/models/License.txt`.
- Os arquivos `.glb` originais estão em `src/renderer/src/assets/models/*.b64.txt`
  (o mesmo conteúdo, codificado em base64, para carregar igual no app de desenvolvimento e
  no empacotado). O mapeamento bloco → modelo está em
  `src/renderer/src/three/builtinModels.ts`.
- Blocos sem modelo (por exemplo, mesas de jantar com cadeiras, piano, lareira) continuam
  como volumes simples extrudados do símbolo 2D. O botão "Móveis detalhados" na barra 3D
  alterna entre os dois.
