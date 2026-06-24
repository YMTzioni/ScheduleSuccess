const scanBtn = document.getElementById('scanBtn');
const copyBtn = document.getElementById('copyBtn');
const downloadJsonBtn = document.getElementById('downloadJsonBtn');
const statusEl = document.getElementById('status');
const outputEl = document.getElementById('output');
let lastScanResult = null;

function setStatus(text) {
  statusEl.textContent = text;
}

function formatResult(result) {
  if (!result?.courses?.length) {
    const debugText = result?.debug
      ? `\n\n[Debug]\nנמצאו קישורים: ${result.debug.discoveredLinks}\nנסרקו: ${result.debug.visited}\nדולגו בלי שיעורים: ${result.debug.skippedNoLessons}`
      : '';
    return `לא נמצאו שיעורים.${debugText}`;
  }

  return result.courses
    .map((course, index) => {
      const lessons = course.lessons.length
        ? course.lessons.map((lesson) => `  - ${lesson}`).join('\n')
        : '  - (לא נמצאו שיעורים)';
      return `${index + 1}. ${course.title}\n${lessons}`;
    })
    .join('\n\n');
}

scanBtn.addEventListener('click', async () => {
  scanBtn.disabled = true;
  outputEl.value = '';
  setStatus('מתחיל סריקה...');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('לא נמצאה לשונית פעילה');

    const response = await chrome.runtime.sendMessage({
      type: 'START_SCAN',
      tabId: tab.id,
      startUrl: tab.url,
    });

    if (!response?.ok) {
      throw new Error(response?.error || 'שגיאה לא ידועה');
    }

    lastScanResult = response.data;
    outputEl.value = formatResult(response.data);
    const debug = response.data.debug;
    setStatus(
      `הסריקה הסתיימה: ${response.data.courses.length} קורסים, מתוך ${debug?.visited ?? 0} שנבדקו.`
    );
  } catch (error) {
    setStatus(`שגיאה: ${error.message}`);
  } finally {
    scanBtn.disabled = false;
  }
});

downloadJsonBtn.addEventListener('click', () => {
  if (!lastScanResult) {
    setStatus('אין נתונים לייצוא עדיין. הרץ סריקה קודם.');
    return;
  }

  try {
    const payload = {
      exportedAt: new Date().toISOString(),
      ...lastScanResult,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    a.href = url;
    a.download = `lessons-list-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setStatus('קובץ JSON ירד בהצלחה.');
  } catch {
    setStatus('נכשל ייצוא JSON.');
  }
});

copyBtn.addEventListener('click', async () => {
  if (!outputEl.value.trim()) {
    setStatus('אין מה להעתיק עדיין.');
    return;
  }

  try {
    await navigator.clipboard.writeText(outputEl.value);
    setStatus('הרשימה הועתקה ללוח.');
  } catch {
    setStatus('לא הצלחתי להעתיק ללוח.');
  }
});
