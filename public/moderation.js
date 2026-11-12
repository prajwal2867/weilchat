const $ = (id) => document.getElementById(id);
let token = "";

function setStatus(message) {
  $("status-message").textContent = message;
}

function makeText(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = text;
  return node;
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      Authorization: "Bearer " + token,
      ...(options.headers || {}),
      ...(options.body ? { "Content-Type": "application/json" } : {})
    }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Request failed (" + response.status + ")");
  return body;
}

function render(reports) {
  const root = $("reports");
  root.replaceChildren();
  if (!reports.length) {
    root.append(makeText("p", "empty", "No reports in this view."));
    return;
  }

  for (const report of reports) {
    const item = document.createElement("article");
    item.className = "report";
    const head = document.createElement("div");
    head.className = "report-head";
    head.append(
      makeText("span", "reason", report.reason || "Unspecified"),
      makeText("span", "muted", (report.status || "open").toUpperCase())
    );
    const meta = makeText(
      "p",
      "meta",
      "Report " + report.id + " · " + new Date(Number(report.createdAt)).toLocaleString() +
        " · Reported session " + (report.reported || "unknown") + " · Reporter session " + (report.reporter || "unknown")
    );
    const actions = document.createElement("div");
    actions.className = "actions";
    if (report.status === "open") {
      for (const [status, label] of [["resolved", "Resolve"], ["dismissed", "Dismiss"]]) {
        const button = makeText("button", "secondary", label);
        button.type = "button";
        button.addEventListener("click", async () => {
          button.disabled = true;
          try {
            await request("/api/moderation", {
              method: "PATCH",
              body: JSON.stringify({ reportId: report.id, status })
            });
            await loadReports();
          } catch (error) {
            setStatus(error.message);
            button.disabled = false;
          }
        });
        actions.append(button);
      }
    }
    item.append(head, meta, actions);
    root.append(item);
  }
}

async function loadReports() {
  token = $("token").value.trim();
  if (!token) {
    setStatus("Enter the moderation access token first.");
    return;
  }
  $("load").disabled = true;
  setStatus("Loading reports…");
  try {
    const status = encodeURIComponent($("status").value);
    const result = await request("/api/moderation?status=" + status + "&limit=50");
    render(result.reports || []);
    setStatus((result.reports || []).length + " report(s) loaded.");
  } catch (error) {
    $("reports").replaceChildren();
    setStatus(error.message);
  } finally {
    $("load").disabled = false;
  }
}

$("load").addEventListener("click", loadReports);
$("status").addEventListener("change", () => {
  if (token) loadReports();
});
