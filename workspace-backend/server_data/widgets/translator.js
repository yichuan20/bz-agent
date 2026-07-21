(function () {
  const languages = {
    "en": "English", "zh": "Chinese", "es": "Spanish", "fr": "French",
    "de": "German", "ja": "Japanese", "ko": "Korean", "ar": "Arabic",
    "pt": "Portuguese", "it": "Italian", "ru": "Russian", "hi": "Hindi"
  };

  function init() {
    const root = document.body;
    root.style.cssText = "height:100vh;overflow:hidden;background:var(--bg-primary);color:var(--text-primary);font-family:var(--font-body);display:flex;flex-direction:column;padding:12px;box-sizing:border-box;gap:8px;margin:0;";

    function buildSelect(selectedCode) {
      const sel = document.createElement("select");
      sel.style.cssText = "flex:1;background:var(--bg-primary);color:var(--text-primary);border:1px solid var(--border-primary);border-radius:var(--radius-md);padding:4px 6px;font-size:13px;cursor:pointer;";
      Object.entries(languages).forEach(([code, name]) => {
        const opt = document.createElement("option");
        opt.value = code; opt.textContent = name;
        if (code === selectedCode) opt.selected = true;
        sel.appendChild(opt);
      });
      return sel;
    }

    const langRow = document.createElement("div");
    langRow.style.cssText = "display:flex;align-items:center;gap:6px;";
    const fromSel = buildSelect("en");
    const swapBtn = document.createElement("button");
    swapBtn.textContent = "⇄";
    swapBtn.style.cssText = "background:none;border:1px solid var(--border-primary);color:var(--text-primary);border-radius:var(--radius-md);padding:4px 8px;cursor:pointer;font-size:14px;";
    const toSel = buildSelect("zh");
    langRow.append(fromSel, swapBtn, toSel);

    const inputBox = document.createElement("textarea");
    inputBox.placeholder = "Enter text to translate...";
    inputBox.style.cssText = "flex:1;resize:none;background:var(--bg-primary);color:var(--text-primary);border:1px solid var(--border-primary);border-radius:var(--radius-md);padding:8px;font-size:13px;font-family:var(--font-body);outline:none;";

    const translateBtn = document.createElement("button");
    translateBtn.textContent = "Translate";
    translateBtn.style.cssText = "background:var(--accent-blue);color:#fff;border:none;border-radius:var(--radius-md);padding:7px;font-size:13px;cursor:pointer;font-family:var(--font-body);";

    const outputBox = document.createElement("div");
    outputBox.style.cssText = "flex:1;overflow-y:auto;background:var(--bg-primary);color:var(--text-secondary);border:1px solid var(--border-primary);border-radius:var(--radius-md);padding:8px;font-size:13px;white-space:pre-wrap;";
    outputBox.textContent = "Translation will appear here...";

    root.append(langRow, inputBox, translateBtn, outputBox);

    swapBtn.addEventListener("click", () => {
      const tmp = fromSel.value; fromSel.value = toSel.value; toSel.value = tmp;
      const tmpText = inputBox.value;
      inputBox.value = outputBox.textContent === "Translation will appear here..." ? "" : outputBox.textContent;
      outputBox.textContent = tmpText || "Translation will appear here...";
    });

    translateBtn.addEventListener("click", async () => {
      const text = inputBox.value.trim();
      if (!text) return;
      translateBtn.textContent = "Translating..."; translateBtn.disabled = true;
      outputBox.style.color = "var(--text-secondary)";
      try {
        const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${fromSel.value}|${toSel.value}`;
        const res = await fetch(url);
        const data = await res.json();
        const result = data?.responseData?.translatedText;
        outputBox.textContent = result || "No translation returned.";
        outputBox.style.color = "var(--text-primary)";
      } catch (e) {
        outputBox.textContent = "Translation failed. Check your connection.";
        outputBox.style.color = "var(--accent-red)";
      } finally {
        translateBtn.textContent = "Translate"; translateBtn.disabled = false;
      }
    });

    inputBox.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) translateBtn.click();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else { init(); }
})();