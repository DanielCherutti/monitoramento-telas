# Protocolo (MVP) — Preview e Anotações

Este documento define um contrato inicial (MVP) para integração do agente Windows.

## Autenticação do agente
No MVP, o agente se identifica por `agentId` + um token de provisionamento (a implementar).

## Preview (dashboard)

### Envio de frames (device -> API)
- WebSocket: `ws://API/ws/device/preview?agentId=...`
- Mensagens:
  - `binary`: payload do frame (JPEG/WebP)
  - `json`: metadados opcionais, ex. `{ "type": "meta", "width": 1280, "height": 720 }`

### Consumo de frames (webapp -> API)
- WebSocket: `ws://API/ws/supervisor/preview?deviceId=...`
- Auth: header `Authorization: Bearer <jwt>`
- Recebe frames `binary` (JPEG/WebP).

## Anotações (overlay)

### Sessão de anotação (webapp -> API)
- WebSocket: `ws://API/ws/supervisor/annotate?deviceId=...`
- Auth: header `Authorization: Bearer <jwt>`

Mensagens JSON (supervisor -> API -> device):
- `annotation_begin`: inicia (e pode disparar prompt no device por política)
- `stroke_add`: adiciona pontos de um stroke
- `clear`: limpa overlay
- `annotation_end`: encerra

Exemplo `stroke_add`:
```json
{
  "type": "stroke_add",
  "strokeId": "uuid",
  "color": "#ff3b30",
  "width": 4,
  "points": [
    { "x": 0.12, "y": 0.22, "t": 1730000000 },
    { "x": 0.13, "y": 0.23, "t": 1730000005 }
  ]
}
```

Observações:
- \(x, y\) são normalizados \(0..1\) para suportar DPI e múltiplas resoluções.
- O agente deve projetar \(x,y\) para o monitor alvo (MVP: monitor primário).

