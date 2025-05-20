document.getElementById("summarize").addEventListener("click", async () => {
  const resultDiv = document.getElementById("result");
  resultDiv.innerHTML = '<div class="loading"><div class="loader"></div></div>';
  const summaryType = document.getElementById("summary-type").value;

  chrome.storage.sync.get(["geminiApiKey"], async (result) => {
    if (!result.geminiApiKey) {
      resultDiv.innerHTML = "API key not found. Please set your API key in the extension options.";
      return;
    }

    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      chrome.tabs.sendMessage(tab.id, { type: "GET_ARTICLE_TEXT" }, async (res) => {
        if (!res || !res.text) {
          resultDiv.innerText = "Could not extract article text from this page.";
          return;
        }

        try {
          const summary = await getGeminiSummary(res.text, summaryType, result.geminiApiKey);
          resultDiv.innerText = summary;
          saveSummaryToHistory(summary);
        } catch (error) {
          resultDiv.innerText = `Error: ${error.message || "Failed to generate summary."}`;
        }
      });
    });
  });
});

document.getElementById("copy-btn").addEventListener("click", () => {
  const summaryText = document.getElementById("result").innerText;
  if (summaryText.trim() !== "") {
    navigator.clipboard.writeText(summaryText).then(() => {
      const copyBtn = document.getElementById("copy-btn");
      const originalText = copyBtn.innerText;
      copyBtn.innerText = "Copied!";
      setTimeout(() => (copyBtn.innerText = originalText), 2000);
    });
  }
});

// Dark mode toggle
chrome.storage.sync.get(["darkMode"], (res) => {
  if (res.darkMode) {
    document.body.classList.add("dark");
    document.getElementById("dark-toggle").checked = true;
  }
});

document.getElementById("dark-toggle").addEventListener("change", (e) => {
  const dark = e.target.checked;
  document.body.classList.toggle("dark", dark);
  chrome.storage.sync.set({ darkMode: dark });
});

function saveSummaryToHistory(summary) {
  chrome.storage.local.get(["summaryHistory"], (res) => {
    const history = res.summaryHistory || [];
    history.unshift(summary);
    if (history.length > 5) history.pop();
    chrome.storage.local.set({ summaryHistory: history });
    renderHistory(history);
  });
}

function renderHistory(history) {
  const historyList = document.getElementById("history");
  historyList.innerHTML = "";
  history.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item.slice(0, 100) + (item.length > 100 ? "..." : "");
    historyList.appendChild(li);
  });
}

chrome.storage.local.get(["summaryHistory"], (res) => {
  renderHistory(res.summaryHistory || []);
});

async function getGeminiSummary(text, summaryType, apiKey) {
  const maxLength = 20000;
  const truncatedText = text.length > maxLength ? text.substring(0, maxLength) + "..." : text;

  let prompt;
  switch (summaryType) {
    case "brief":
      prompt = `Provide a brief summary of the following article in 2-3 sentences:\n\n${truncatedText}`;
      break;
    case "detailed":
      prompt = `Provide a detailed summary of the following article, covering all main points and key details:\n\n${truncatedText}`;
      break;
    case "bullets":
      prompt = `Summarize the following article in 5-7 key points. Format each point as a line starting with "- ":\n\n${truncatedText}`;
      break;
    default:
      prompt = `Summarize the following article:\n\n${truncatedText}`;
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2 },
      }),
    }
  );

  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(errorData.error?.message || "API request failed");
  }

  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || "No summary available.";
}
