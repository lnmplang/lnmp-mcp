# 🧪 LNMP MCP Test Guide

## ✅ WASM Build Complete!

WASM binary başarıyla build edildi ve deploy edildi:
- **Size**: 963KB
- **Location**: `tools/mcp/adapter/src/wasm/lnmp_wasm_bg.wasm`
- **Exports**: 20 functions (7 core + 13 new)

## 🚀 Test Etme Yöntemleri

### 1. Hızlı Demo (Core Tools)

```bash
cd tools/mcp/adapter
node scripts/test_demo.js
```

Bu script core 7 tool'u test eder (parse, encode, binary, etc).

### 2. MCP Server Başlat

Full server ile tüm 16 tool'u test et:

```bash
npm start
```

Server şu adreste çalışacak: `stdio` (MCP protocol)

### 3. MCP Inspector (Görsel Test - Önerilen!)

En kolay yol - web UI ile test:

```bash
npx @modelcontextprotocol/inspector npm start
```

Bu komut:
1. MCP server'ı başlatır
2. Web browser açar (http://localhost:5173)
3. Sol panelde 16 tool'u gösterir
4. Her birini tıklayıp test edebilirsin!

**Örnek test**:
- Tool seç: `lnmp.parse`
- Input gir: `{"text": "F12=42\nF7=1"}`
- Run tıkla
- Sonucu gör: `{"record": {"12": 42, "7": true}}`

### 4. Claude Desktop Entegrasyonu

Claude Desktop'a ekle (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "lnmp": {
      "command": "node",
      "args": ["/Users/madraka/lnmp-workspace/lnmp-protocol/tools/mcp/adapter/dist/index.js"]
    }
  }
}
```

Claude Desktop'ı restart et, sonra Claude'a sor:
```
Use lnmp.parse to parse: F12=42 F7=1
```

## 🎯 Test Edebileceğin Tool'lar

### Core Tools (7) - ✅ Çalışıyor
1. `lnmp.parse` - Parse LNMP text
2. `lnmp.encode` - Encode to LNMP
3. `lnmp.decodeBinary` - Binary → text
4. `lnmp.encodeBinary` - Text → binary
5. `lnmp.schema.describe` - Schema info
6. `lnmp.debug.explain` - Debug output
7. `lnmp.sanitize` - Input sanitization

### New Tools (9) - ✅ WASM Ready
8. `lnmp.envelope.wrap` - Add metadata
9. `lnmp.network.decide` - Route to LLM vs local
10. `lnmp.network.importance` - Importance score
11. `lnmp.transport.toHttp` - Generate HTTP headers
12. `lnmp.transport.fromHttp` - Parse headers
13. `lnmp.embedding.computeDelta` - Vector delta
14. `lnmp.embedding.applyDelta` - Apply delta
15. `lnmp.spatial.encode` - 3D encoding
16. `lnmp.context.score` - Context scoring

## 📝 Örnek Test Senaryoları

### Envelope Wrapping
```json
{
  "tool": "lnmp.envelope.wrap",
  "arguments": {
    "record": {"12": 42, "7": true},
    "metadata": {
      "timestamp": 1732564887000,
      "source": "test-agent",
      "trace_id": "abc123"
    }
  }
}
```

### Network Routing
```json
{
  "tool": "lnmp.network.decide",
  "arguments": {
    "message": {
      "envelope": {
        "record": {"12": 42},
        "metadata": {"timestamp": 1732564887000}
      },
      "kind": "Alert",
      "priority": 250
    }
  }
}
```
Sonuç: `{"decision": "SendToLLM"}`

### Embedding Delta
```json
{
  "tool": "lnmp.embedding.computeDelta",
  "arguments": {
    "base": [0.1, 0.2, 0.3, 0.4, 0.5],
    "updated": [0.1, 0.25, 0.3, 0.4, 0.5]
  }
}
```
Sonuç: 80-95% compression ratio

## 🎉 Hızlı Başlangıç

**3 adımda test**:
```bash
cd tools/mcp/adapter
npx @modelcontextprotocol/inspector npm start
# Browser açılacak → Tool seç → Test et!
```

## 🐛 Sorun Giderme

**WASM not initialized**:
- `npm run build` yap
- WASM dosyasını kontrol et: `ls -lh src/wasm/lnmp_wasm_bg.wasm`

**Server başlamıyor**:
- `npm install` yap
- `node dist/index.js` direkt çalıştır

**Tool bulunamıyor**:
- `dist/` klasörünü kontrol et
- `npm run build` tekrar yap

---

**Not**: MCP Inspector en kolay test yöntemi - görsel UI ile tüm tool'ları deneyebilirsin! 🎯
