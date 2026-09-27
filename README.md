# TripSIM AI Web v2

黑客松可直接展示的「自然語言 + RAG + eSIM 推薦引擎」原型。

## 特色
- 一句話輸入旅程，不需要填表。
- 本地 RAG 知識檢索，顯示推薦依據。
- 商品 JSON 資料庫，依國家 / 天數 / 流量自動匹配。
- Offline fallback：沒有 API Key 也能完整 Demo。
- Live AI：設定 OpenAI API Key 後，需求理解與個人化文案自動切換成 LLM。

> 注意：`data/products.json` 的商品名稱與價格是 Demo 模擬資料，正式參賽請替換成主辦方允許使用的真實資料。

## 立即啟動
需要 Node.js 18+。

```bash
npm start
```

瀏覽器開啟：

```text
http://localhost:3000
```

不需要 `npm install`，專案只使用 Node.js 內建模組。

## 啟用 Live AI（選用）
macOS / Linux:

```bash
export OPENAI_API_KEY="你的 API Key"
export OPENAI_MODEL="gpt-6-astra"
npm start
```

Windows PowerShell:

```powershell
$env:OPENAI_API_KEY="你的 API Key"
$env:OPENAI_MODEL="gpt-6-astra"
npm start
```

API Key 只放在伺服器環境變數，不會出現在前端程式。

## 架構
Browser → `/api/analyze` → LLM（有 Key 時）/ Local Parser → Local RAG → Rule-based 流量估算 → Product DB → GenAI 文案 / Offline 文案 → UI

## 建議下一步
1. 用官方 eSIM SKU、有效天數、流量與價格替換 `products.json`。
2. 把 `knowledge.json` 擴充為 FAQ、安裝說明、國家/電信商支援資訊。
3. 新增 UTM / GA4 事件追蹤，量測健檢完成率、推薦點擊率、CVR、分享率。
4. 串接真正購買連結或訂單 API。
