# Plano de execução — recursos que faltam (comparado ao Planner 5D)

Base: o PlanKraft já tem desenho 2D, cotas, camadas, blocos, imagem de fundo, PDF vetorial, geração offline/IA e maquete 3D.
Este plano cobre o que falta, em fases pequenas, cada uma entregável e testável sozinha.

## Princípios

- **Aditivo primeiro:** mudanças de modelo ficam retrocompatíveis (campos opcionais + migração na leitura de `.plankraft`).
- **Uma fonte de verdade:** 2D, 3D e PDF continuam gerados do mesmo `PlanDocument`.
- **Offline por padrão:** nada exige conta, internet ou chave; IA é opcional.
- **Cada fase fecha com:** typecheck + build, teste manual no Electron (CDP, como nas etapas anteriores), screenshot no README e commit.

## Ordem e dependências

```
Fase 1 Materiais ──► Fase 2 Vários andares ──► Fase 3 Passeio 1ª pessoa
                                   │
                                   └──► Fase 5 Detalhes arquitetônicos ──► Fase 6 Área externa
Fase 4 Planta a partir de imagem (independente; usa a IA já integrada)
Fase 7 Catálogo 3D / importar modelos  ·  Fase 8 Render melhor  (opcionais, depois das demais)
```

Por que materiais antes de andares: é aditivo (baixo risco) e já muda o visual. Andares mexe na estrutura do documento, então vem logo depois, antes de empilhar mais recursos sobre o modelo.

---

## Fase 1 — Materiais e acabamentos  (~3–4 dias)

**Objetivo:** pintar paredes e pisos com cor ou textura, visível em 2D e 3D.

**Modelo (`src/shared/model.ts`)**
- Novo tipo `Material { id, name, kind: 'color'|'texture', color, textureId?, scale }`.
- `Room.floorMaterial?`, `Wall.materialA?`/`materialB?` (cada lado da parede), `BlockObject.material?`.
- `PlanDocument.materials` (cópia dos usados, como já é feito com blocos) + migração: ausente = `[]`.

**Texturas sem baixar arquivos**
- Gerador procedural em canvas (`lib/textures.ts`): madeira (tábuas), porcelanato (grade + rejunte), cimento, pedra, tijolo, azulejo, grama. Cacheadas por id.
- Biblioteca padrão de ~20 materiais + paleta de cores de tinta.

**UI**
- Aba "Materiais" no painel esquerdo (grade de amostras).
- Seleção de cômodo/parede → seção "Acabamento" no `RightPanel`; arrastar amostra sobre o objeto também aplica.
- Conta-gotas (copiar o material de um objeto).

**Render**
- 2D: `RoomShapes` usa `fillPatternImage` do Konva quando houver textura.
- 3D: `buildScene` emite materiais por piso/parede; `Viewer3D` usa `MeshStandardMaterial` com `map` (repeat conforme `scale` em cm).
- PDF: cor sólida média (vetor); opção "hachura" simples por tipo de piso.

**Pronto quando:** pintar sala de azul, quarto com madeira, banheiro com azulejo; aparece no 2D e 3D; salvar/abrir mantém; undo/redo funciona; abrir arquivo antigo sem erro.

**Riscos:** performance de padrões no Konva (mitigar: pré-renderizar tile pequeno e cachear).

---

## Fase 2 — Vários andares e escadas  (~5–7 dias)

**Objetivo:** projeto com N pavimentos, escada ligando-os, 3D empilhado.

**Modelo**
- `PlanDocument.levels: Level[]` (`{ id, name, elevation(cm), height(cm) }`); cada `objeto` e `layer` ganha `levelId`. Migração: documentos antigos viram um único nível "Térreo".
- `editorStore.activeLevelId`; ações de criação gravam o nível ativo; undo/redo já cobre (snapshots).
- Novo bloco paramétrico **escada** (reta, em L, em U; largura, nº de degraus, altura do pé-direito), com abertura (`stairwell`) no piso do nível de cima.

**UI**
- Seletor de andar na barra superior (abas "Térreo · 1º andar · +"), duplicar andar, renomear, apagar.
- Níveis vizinhos aparecem esmaecidos como "fantasma" no 2D (calcar paredes).
- Camadas continuam globais (nome) mas por nível.

**3D / PDF**
- `buildScene` empilha níveis em `elevation`; cortar paredes por andar; botão "mostrar só andar X / todos".
- PDF: uma página por andar (reaproveitando `exportPdf`), quadro de áreas por andar + total.

**Pronto quando:** casa com 2 andares gerada/desenhada, escada visível nos dois, 3D empilhado, PDF multipágina, arquivo antigo abre como 1 andar.

**Riscos:** maior mudança de modelo → testes de migração e revisão de todos os `doc.objects.filter(...)`. Fazer em PR isolado.

---

## Fase 3 — Passeio virtual em primeira pessoa  (~2–3 dias)

**Objetivo:** andar dentro da casa na altura dos olhos.

- Novo modo no `Viewer3D`: "Passeio" (botão + atalho). Câmera a 1,60 m, `PointerLockControls` (drei), W/A/S/D/Shift, Esc sai.
- Colisão simples: círculo de raio 25 cm contra segmentos de parede (reaproveita `wallGeometry`), com vãos de porta atravessáveis.
- Com a Fase 2: sobe/desce escadas ajustando a altura pelo piso do nível.
- Posição inicial: clique no 2D "Começar passeio aqui" (marcador com direção).

**Pronto quando:** entrar pela porta, não atravessar paredes, passar por portas, sair com Esc.

---

## Fase 4 — Planta a partir de imagem  (~4–5 dias)

**Objetivo:** foto/PDF de uma planta → projeto editável.

- Reaproveita a imagem de fundo já importada + calibração de escala.
- Novo botão "Reconhecer planta" (exige chave Claude/OpenAI com visão; desabilitado e explicado quando offline).
- Main: envia a imagem com `AI_RECOGNITION_PROMPT` pedindo cômodos como retângulos/polígonos em pixels + paredes + aberturas; saída validada por Zod (schema novo, `shared/aiRecognize.ts`).
- Renderer: converte pixels → cm usando a escala calibrada; usa o mesmo caminho de `planFromAi` (paredes, portas, janelas, áreas).
- Tela de revisão: sobreposição semitransparente do resultado sobre a imagem antes de aplicar; "Aplicar" cria tudo como uma entrada de undo.
- Custos: aviso do número aproximado de tokens; cancelável (`aiCancel` já existe).

**Pronto quando:** planta simples (retangular) é reconhecida com cômodos corretos ±10%; plantas complexas dão resultado editável, não perfeito (documentar limite).

**Riscos:** precisão da IA com diagonais/ruído; não dá para testar sem chave (planejar teste com mock + chave do usuário).

---

## Fase 5 — Detalhes arquitetônicos  (~3–4 dias)

- Aberturas: porta de correr, porta dupla, porta camarão, janela basculante/maxim-ar, janela de canto, vão livre (arco). Campo `variant` em `Door`/`Window` + símbolos 2D/3D.
- Pilares (retangular/circular) e vigas aparentes.
- Telhado simples (duas águas, quatro águas, laje plana) gerado a partir do contorno externo, só no 3D, com ligar/desligar.
- Nichos e rebaixos de gesso: retângulo com altura própria (extrusão).

**Pronto quando:** cada variante aparece correta em 2D, 3D e PDF.

---

## Fase 6 — Área externa  (~2–3 dias)

- Terreno: polígono de lote com área e recuos (limite no 2D, plano de grama no 3D).
- Novos "cômodos" externos: piscina (com água no 3D), gramado, deck, calçada.
- Objetos: cerca/muro (parede fina e baixa com estilo), portão, árvores e plantas (blocos), mobília de jardim.
- Reaproveita materiais da Fase 1 (grama, pedra, madeira).

---

## Fase 7 — Catálogo maior e modelos 3D próprios  (~1 semana, opcional)

- Ampliar os blocos vetoriais de 32 para ~100 (mais por cômodo).
- Importar modelos **glTF/GLB** do usuário e associar a um bloco (2D = contorno/bounding box; 3D = modelo). Armazenados em `assets/` do projeto.
- Não embutir catálogo de terceiros (licença/tamanho); só fontes de licença livre se o usuário optar.

---

## Fase 8 — Qualidade visual do render  (~3–4 dias, opcional)

- Iluminação melhor: hora do dia (sol por azimute/elevação), céu, ambient occlusion (postprocessing), sombras suaves.
- Exportar PNG em resolução maior (2K/4K) renderizando fora da tela.
- Panorama 360° (equirretangular) a partir de um ponto: renderiza cubemap e exporta.
- Sem ray tracing (fora do escopo); documentar como "render rápido".

---

## Fora do escopo (decisão)

Nuvem/conta, app web/celular, colaboração em tempo real, AR, comunidade/galeria. Mudariam a natureza do produto (desktop, local, sem conta). Reavaliar só se houver demanda.

## Resumo de esforço

| Fase | Recurso | Esforço | Risco |
|---|---|---|---|
| 1 | Materiais e texturas | 3–4 d | baixo |
| 2 | Vários andares + escada | 5–7 d | **alto** (modelo) |
| 3 | Passeio 1ª pessoa | 2–3 d | baixo |
| 4 | Planta a partir de imagem | 4–5 d | médio (IA) |
| 5 | Detalhes arquitetônicos | 3–4 d | médio |
| 6 | Área externa | 2–3 d | baixo |
| 7 | Catálogo / glTF | ~1 sem | médio |
| 8 | Render melhor | 3–4 d | médio |

Núcleo recomendado (fases 1–3): ~10–14 dias de trabalho e já aproxima bastante a experiência do Planner 5D.
