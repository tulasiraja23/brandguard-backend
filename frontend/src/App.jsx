import { useCallback, useEffect, useState } from "react";
import "./App.css";
import "./App.extra.css";
import { buildRewrite, buildSegments, formatQuantity, DIMENSIONS, DEMO_CONTENT, SEVERITIES } from "./utils/analyzer";
import { api, clearToken, getToken } from "./services/api";
import LoginPage from "./LoginPage";
import TeamManagement from "./components/TeamManagement";

/* ------------------------------ small helpers ------------------------------ */

const formatDate = (iso) => new Date(iso).toLocaleString();

// The API returns MongoDB-style documents. These keep the rest of the UI simple.
const normaliseRule = (rule) => ({
  id: rule._id, code: rule.code, phrase: rule.phrase, severity: rule.severity, reason: rule.reason || "", version: rule.version,
});
const normaliseFact = (fact) => ({
  id: fact._id, name: fact.name, dimension: fact.dimension, value: fact.value, unit: fact.unit,
  valueText: fact.valueText, sourceName: fact.sourceName, excerpt: fact.excerpt, version: fact.version,
});
const normaliseSubmission = (submission) => ({
  id: submission._id,
  createdAt: submission.createdAt,
  content: submission.content,
  contentType: submission.contentType,
  findings: submission.analysis?.findings || [],
  risk: submission.analysis?.risk || "None",
  riskReason: submission.analysis?.riskReason || "",
  counts: submission.analysis?.counts || { High: 0, Medium: 0, Low: 0, supported: 0 },
  aiMode: submission.analysis?.aiMode,
  aiNote: submission.analysis?.aiNote,
  revisedText: submission.revisedText || "",
  finalText: submission.finalText || "",
  status: submission.status,
  stale: Boolean(submission.stale),
  history: (submission.events || []).map((entry) => ({
    at: entry.at,
    by: entry.byName ? `${entry.byName} (${entry.role})` : entry.role || "system",
    action: entry.action,
    comment: entry.comment || "",
  })),
});

const CONTENT_TYPES = [
  { value: "advertisement", label: "Advertisement" },
  { value: "social", label: "Social media post" },
  { value: "email", label: "Email" },
  { value: "website", label: "Website copy" },
  { value: "general", label: "General marketing content" },
];

const STATUS_LABELS = {
  analysed: "Analysed",
  pending: "Awaiting review",
  approved: "Approved",
  rejected: "Rejected",
};

const NAV_ITEMS = [
  { name: "Overview", icon: "◉" },
  { name: "Review Queue", icon: "✓" },
  { name: "Brand Rules", icon: "◇" },
  { name: "Trusted Facts", icon: "▤" },
  { name: "Review History", icon: "◷" },
  { name: "Team Management", icon: "♙", adminOnly: true },
];

/* ------------------------------ small components ------------------------------ */

function RiskPill({ risk, suffix = "" }) {
  return <span className={`risk-pill ${risk.toLowerCase()}`}>{risk}{suffix}</span>;
}

function StatusPill({ status }) {
  return <span className={`status-pill ${status}`}>{STATUS_LABELS[status]}</span>;
}

function HighlightedText({ content, findings }) {
  return (
    <p className="highlighted-text">
      {buildSegments(content, findings).map((segment, index) =>
        segment.finding ? (
          <mark
            key={index}
            className={`hl hl-${segment.finding.severity.toLowerCase()}`}
            title={`${segment.finding.severity}: ${segment.finding.title}`}
          >
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        )
      )}
    </p>
  );
}

function FindingCard({ finding }) {
  return (
    <div className="finding">
      <span className={`finding-dot ${finding.severity.toLowerCase()}`} />
      <div>
        <div className="finding-meta">
          <span className="rule-id">{finding.ruleId}</span>
          <span className={`severity-tag ${finding.severity.toLowerCase()}`}>
            {finding.severity === "Info" ? "Supported" : `${finding.severity} severity`}
          </span>
          {finding.verdict && <span className={`verdict-tag ${finding.verdict}`}>{finding.verdict}</span>}
          <span className={`source-badge ${finding.source === "demo" ? "demo" : ""}`}>
            {finding.source === "ai" ? "AI suggestion" : finding.source === "demo" ? "DEMO heuristic (not AI)" : "Rule-based check"}
          </span>
        </div>
        <strong>{finding.title}</strong>
        <p>{finding.detail}</p>

        <div className="evidence-block">
          <span className="evidence-label">MATCHED TEXT</span>
          <code>{finding.matchedText}</code>
        </div>

        {finding.evidence && (
          <div className="source-box">
            <span className="evidence-label">APPROVED SOURCE · v{finding.evidence.version}</span>
            <strong>{finding.evidence.sourceName}</strong>
            <p>“{finding.evidence.excerpt}”</p>
          </div>
        )}
        {finding.verdict === "unverified" && (
          <p className="muted-text">No approved source covers this claim. Unverified does not mean false.</p>
        )}

        <div className="remediation-block">
          <span className="evidence-label">WHY THIS RISK LEVEL</span>
          <p>{finding.reason}</p>
          <small>{finding.suggestion}</small>
        </div>
      </div>
    </div>
  );
}

function ReviewCard({ review, canReview, onDecide }) {
  const [finalText, setFinalText] = useState(review.revisedText);
  const [comment, setComment] = useState("");
  const isReviewer = canReview;
  const needsComment = review.risk === "High";

  return (
    <div className="panel review-card">
      <div className="results-header">
        <div>
          <div className="eyebrow">SUBMITTED {formatDate(review.createdAt).toUpperCase()}</div>
          <h2>{review.content.slice(0, 70)}{review.content.length > 70 ? "…" : ""}</h2>
        </div>
        <RiskPill risk={review.risk} suffix=" risk" />
      </div>

      <p className="muted-text">{review.riskReason}</p>
      <div className="compare-grid">
        <div>
          <div className="evidence-label">ORIGINAL (FLAGGED TEXT HIGHLIGHTED)</div>
          <HighlightedText content={review.content} findings={review.findings} />
        </div>
        <div>
          <label className="evidence-label" htmlFor={`final-${review.id}`}>FINAL TEXT (EDITABLE BY REVIEWER)</label>
          <textarea
            id={`final-${review.id}`}
            rows={5}
            value={finalText}
            onChange={(event) => setFinalText(event.target.value)}
            disabled={!isReviewer}
          />
        </div>
      </div>

      <div className="finding-list">
        {review.findings.filter((finding) => finding.severity !== "Info").map((finding) => (
          <FindingCard key={finding.id} finding={finding} />
        ))}
      </div>

      <label className="field-label" htmlFor={`comment-${review.id}`}>
        REVIEWER COMMENT {needsComment && "(required: this item is High risk)"}
      </label>
      <textarea
        id={`comment-${review.id}`}
        rows={2}
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        disabled={!isReviewer}
        placeholder={isReviewer ? "Explain your decision…" : "Only reviewers and admins can decide."}
      />
      <div className="button-row">
        <button
          className="primary-button"
          disabled={!isReviewer}
          onClick={() => onDecide(review.id, "approved", finalText, comment)}
        >
          Approve
        </button>
        <button
          className="secondary-button danger-button"
          disabled={!isReviewer}
          onClick={() => onDecide(review.id, "rejected", finalText, comment)}
        >
          Reject
        </button>
      </div>
      {!isReviewer && <p className="disclaimer">Only reviewers and admins can approve or reject content.</p>}
    </div>
  );
}

/* ------------------------------ main app ------------------------------ */

function Workspace({ session, onSignOut }) {
  const { user, organisation } = session;
  const canReview = user.role === "reviewer" || user.role === "admin";
  const initials = user.name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase();

  const [activePage, setActivePage] = useState("Overview");
  const [content, setContent] = useState(DEMO_CONTENT);
  const [contentType, setContentType] = useState("advertisement");
  const [rules, setRules] = useState([]);
  const [facts, setFacts] = useState({ items: [] });
  const [reviews, setReviews] = useState([]);
  const [currentId, setCurrentId] = useState(null);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [newRule, setNewRule] = useState({ phrase: "", severity: "Medium", reason: "" });
  const [newFact, setNewFact] = useState({
    name: "", dimension: "volume", value: "", unit: "ml", valueText: "", sourceName: "", excerpt: "",
  });

  const currentReview = reviews.find((review) => review.id === currentId) || null;
  const pending = reviews.filter((review) => review.status === "pending");
  const decided = reviews.filter((review) => review.status === "approved" || review.status === "rejected");
  const highRiskCount = reviews.filter((review) => review.risk === "High").length;
  const isStale = (review) => review.stale;

  // A 401 means the token expired or the account was removed: go back to sign-in.
  const handleError = useCallback(
    (error) => {
      if (error.status === 401) {
        onSignOut();
        return;
      }
      setNotice(error.message);
    },
    [onSignOut]
  );

  const reload = useCallback(async () => {
    try {
      const [ruleData, factData, submissionData] = await Promise.all([api.listRules(), api.listFacts(), api.listSubmissions()]);
      setRules(ruleData.rules.map(normaliseRule));
      setFacts({ items: factData.facts.map(normaliseFact) });
      setReviews(submissionData.submissions.map(normaliseSubmission));
    } catch (error) {
      handleError(error);
    } finally {
      setLoading(false);
    }
  }, [handleError]);

  useEffect(() => {
    reload();
  }, [reload]);

  /* ---- review actions ---- */

  const updateReview = (id, patch) =>
    setReviews((previous) => previous.map((review) => (review.id === id ? { ...review, ...patch } : review)));

  const replaceReview = (submission) => {
    const review = normaliseSubmission(submission);
    setReviews((previous) => previous.map((item) => (item.id === review.id ? review : item)));
    return review;
  };

  const analyseText = async (rawText) => {
    const text = rawText.trim();
    if (!text) {
      setNotice("Please enter some marketing content first.");
      return;
    }
    setBusy(true);
    try {
      const { submission } = await api.analyse(text, contentType);
      const review = normaliseSubmission(submission);
      setReviews((previous) => [review, ...previous]);
      setCurrentId(review.id);
      setNotice("Content check completed.");
    } catch (error) {
      handleError(error);
    } finally {
      setBusy(false);
    }
  };

  // Saves the writer's edit of the suggested rewrite (called when the box loses focus).
  const saveRevised = async (review) => {
    if (review.status !== "analysed") return;
    try {
      await api.editSubmission(review.id, { revisedText: review.revisedText });
    } catch (error) {
      handleError(error);
    }
  };

  const submitForReview = async (review) => {
    try {
      await api.editSubmission(review.id, { revisedText: review.revisedText });
      const { submission } = await api.submitForReview(review.id);
      replaceReview(submission);
      setNotice("Submitted. A reviewer can now approve or reject it in the Review Queue.");
    } catch (error) {
      handleError(error);
    }
  };

  const recheck = async (review) => {
    setBusy(true);
    try {
      const { submission } = await api.recheck(review.id);
      const fresh = normaliseSubmission(submission);
      setReviews((previous) => [fresh, ...previous]);
      setCurrentId(fresh.id);
      setNotice("Re-checked against the current rules and facts. The earlier record is kept unchanged.");
    } catch (error) {
      handleError(error);
    } finally {
      setBusy(false);
    }
  };

  const decide = async (id, decision, finalText, comment) => {
    const review = reviews.find((item) => item.id === id);
    if (!review) return;
    if ((decision === "rejected" || review.risk === "High") && !comment.trim()) {
      setNotice("Please add a comment. It is required for rejections and High-risk items.");
      return;
    }
    try {
      const { submission } = await api.decide(id, { decision, finalText, comment: comment.trim() });
      replaceReview(submission);
      setNotice(`Content ${decision}.`);
    } catch (error) {
      handleError(error);
    }
  };

  const openReview = (review) => {
    setContent(review.content);
    setCurrentId(review.id);
    setActivePage("Overview");
    setNotice("Previous review loaded.");
  };

  const copyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setNotice("Copied to clipboard.");
    } catch {
      setNotice("Copy failed. Select and copy the text manually.");
    }
  };

  /* ---- rules ---- */

  const addRule = async () => {
    const phrase = newRule.phrase.trim();
    if (!phrase) return;
    try {
      await api.createRule({ phrase, severity: newRule.severity, reason: newRule.reason.trim() });
      setNewRule({ phrase: "", severity: "Medium", reason: "" });
      await reload();
      setNotice("Brand rule added. Earlier content is now marked as possibly affected.");
    } catch (error) {
      handleError(error);
    }
  };

  const removeRule = async (id) => {
    try {
      await api.deleteRule(id);
      await reload();
      setNotice("Brand rule deactivated. Its history is kept.");
    } catch (error) {
      handleError(error);
    }
  };

  /* ---- facts ---- */

  const changeFactDimension = (dimension) =>
    setNewFact((previous) => ({ ...previous, dimension, unit: DIMENSIONS[dimension].units[0] || "" }));

  const addFact = async () => {
    const isText = newFact.dimension === "text";
    const value = Number(newFact.value);
    if (!newFact.name.trim() || !newFact.sourceName.trim() || !newFact.excerpt.trim()) {
      setNotice("Name, source name and source excerpt are all required.");
      return;
    }
    if (isText ? !newFact.valueText.trim() : !(value > 0)) {
      setNotice(isText ? "Enter the fact text." : "Enter a positive number for the value.");
      return;
    }
    try {
      await api.createFact({
        name: newFact.name.trim(),
        dimension: newFact.dimension,
        ...(isText ? { valueText: newFact.valueText.trim() } : { value, unit: newFact.unit }),
        sourceName: newFact.sourceName.trim(),
        excerpt: newFact.excerpt.trim(),
      });
      setNewFact({ name: "", dimension: "volume", value: "", unit: "ml", valueText: "", sourceName: "", excerpt: "" });
      await reload();
      setNotice("Fact added. Earlier reviews are now marked as possibly affected.");
    } catch (error) {
      handleError(error);
    }
  };

  const removeFact = async (id) => {
    try {
      await api.deleteFact(id);
      await reload();
      setNotice("Fact deactivated. Earlier reviews are now marked as possibly affected.");
    } catch (error) {
      handleError(error);
    }
  };

  const goTo = (page) => {
    setActivePage(page);
    setNotice("");
  };

  if (loading) {
    return <div className="auth-screen"><p>Loading your workspace…</p></div>;
  }

  /* ------------------------------ render ------------------------------ */

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-logo">
          <div className="logo-mark">B</div>
          <div>
            <div className="brand-name">BrandGuard<span> AI</span></div>
            <div className="brand-caption">Verify. Align. Approve.</div>
          </div>
        </div>

        <div className="workspace-label">WORKSPACE</div>
        <nav className="navigation">
          {NAV_ITEMS.filter((item) => !item.adminOnly || user.role === "admin").map((item) => (
            <button
              key={item.name}
              className={`nav-item ${activePage === item.name ? "active" : ""}`}
              aria-current={activePage === item.name ? "page" : undefined}
              onClick={() => goTo(item.name)}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.name}
              {item.name === "Review Queue" && pending.length > 0 && <span className="nav-count">{pending.length}</span>}
              {item.name === "Review History" && reviews.length > 0 && <span className="nav-count">{reviews.length}</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="security-card">
            <div className="security-icon">✳</div>
            <strong>Your brand, protected.</strong>
            <p>Review content before it reaches your audience.</p>
          </div>
          <div className="profile-row">
            <div className="avatar">{initials}</div>
            <div>
              <strong>{organisation.name}</strong>
              <small>{user.name}</small>
            </div>
            <span className="profile-dot" />
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span> <strong>{activePage}</strong>
          </div>
          <div className="topbar-right">
            <span className="user-chip">
              {user.name} <span className="role-tag">{user.role}</span>
            </span>
            <span className="environment"><span /> Connected to API</span>
            <button className="secondary-button" onClick={onSignOut}>Sign out</button>
            <div className="top-avatar">{initials}</div>
          </div>
        </header>

        <div className="page-content">
          {notice && (
            <div className="notice" role="status">
              {notice}
              <button onClick={() => setNotice("")} aria-label="Dismiss">×</button>
            </div>
          )}

          {/* ------------------------- OVERVIEW ------------------------- */}
          {activePage === "Overview" && (
            <>
              <section className="page-heading">
                <div>
                  <div className="eyebrow">BRAND COMPLIANCE CENTER</div>
                  <h1>Brand overview<span>.</span></h1>
                  <p>Make every message consistent, credible and on-brand.</p>
                </div>
                <div className="date-label"><span>◷</span> Fictional demo data</div>
              </section>

              <section className="stats-grid">
                <div className="stat-card">
                  <div className="stat-top"><span>Content reviews</span><span className="stat-icon purple">▤</span></div>
                  <div className="stat-number">{reviews.length}</div>
                  <div className="stat-foot">Stored in the database</div>
                </div>
                <div className="stat-card">
                  <div className="stat-top"><span>Awaiting approval</span><span className="stat-icon orange">✓</span></div>
                  <div className="stat-number">{pending.length}</div>
                  <div className="stat-foot">In the Review Queue</div>
                </div>
                <div className="stat-card">
                  <div className="stat-top"><span>High-risk reviews</span><span className="stat-icon green">⌁</span></div>
                  <div className="stat-number">{highRiskCount}</div>
                  <div className="stat-foot">Highest severity was High</div>
                </div>
                <div className="stat-card">
                  <div className="stat-top"><span>Rules · approved facts</span><span className="stat-icon blue">◈</span></div>
                  <div className="stat-number">{rules.length} · {facts.items.length}</div>
                  <div className="stat-foot">Used by every check</div>
                </div>
              </section>

              <section className="work-grid">
                <div className="panel editor-panel">
                  <div className="panel-heading">
                    <div>
                      <div className="eyebrow">CLAIM DETECTIVE · RULE CHECKS</div>
                      <h2>Review your content</h2>
                      <p>Check a message against brand rules and approved facts.</p>
                    </div>
                    <div className="panel-symbol">✳</div>
                  </div>
                  <label className="field-label" htmlFor="content-type">CONTENT TYPE</label>
                  <select id="content-type" className="type-select" value={contentType} onChange={(event) => setContentType(event.target.value)}>
                    {CONTENT_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                  </select>
                  <label className="field-label" htmlFor="content-input">MARKETING CONTENT</label>
                  <textarea
                    id="content-input"
                    value={content}
                    onChange={(event) => setContent(event.target.value)}
                    placeholder="Paste an ad, campaign message or social media caption..."
                    rows={7}
                  />
                  <div className="textarea-footer">
                    <span>{content.length} characters</span>
                    <span>{rules.length} rules · {facts.items.length} approved facts</span>
                  </div>
                  <div className="button-row">
                    <button className="primary-button" disabled={busy} onClick={() => analyseText(content)}>
                      <span>✳</span> {busy ? "Analysing…" : "Analyse content"} <span>→</span>
                    </button>
                    <button
                      className="secondary-button"
                      onClick={() => {
                        setContent("");
                        setCurrentId(null);
                        setNotice("");
                      }}
                    >
                      Clear
                    </button>
                  </div>
                  <div className="privacy-note">
                    <span>ⓘ</span> Rules and approved facts are checked on the server. If no AI key is configured, the AI step runs in labelled DEMO mode.
                  </div>
                </div>

                <div className="panel results-panel">
                  <div className="results-header">
                    <div>
                      <div className="eyebrow">ANALYSIS REPORT</div>
                      <h2>Review results</h2>
                    </div>
                    {currentReview && <RiskPill risk={currentReview.risk} suffix=" risk" />}
                  </div>

                  {!currentReview ? (
                    <div className="empty-state">
                      <div className="empty-illustration"><div className="empty-ring">✓</div></div>
                      <h3>Ready for review</h3>
                      <p>Your analysis will appear here after you check your content.</p>
                      <div className="empty-tip">
                        <span>✳</span>
                        <div>
                          <strong>What we check</strong>
                          <p>Flagged phrases, measurable claims against approved facts, capitalisation and punctuation.</p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="analysis-results">
                      {isStale(currentReview) && (
                        <div className="stale-banner">
                          <span>Trusted facts changed after this review. The result may be out of date.</span>
                          <button className="text-button" disabled={busy} onClick={() => recheck(currentReview)}>
                            Re-check now
                          </button>
                        </div>
                      )}

                      <div className="summary-area">
                        <strong>{currentReview.risk === "None" ? "No issues detected" : `${currentReview.risk} risk`}</strong>
                        <p>{currentReview.riskReason}</p>
                        {currentReview.aiNote && <p className={`ai-note ${currentReview.aiMode === "demo" ? "demo" : ""}`}>{currentReview.aiNote}</p>}
                        <div className="count-row">
                          <span className="count high">{currentReview.counts.High} High</span>
                          <span className="count medium">{currentReview.counts.Medium} Medium</span>
                          <span className="count low">{currentReview.counts.Low} Low</span>
                          <span className="count supported">{currentReview.counts.supported} Supported</span>
                        </div>
                      </div>

                      <div className="result-section-title">Original vs suggested</div>
                      <div className="compare-grid">
                        <div>
                          <div className="evidence-label">ORIGINAL · FLAGGED TEXT HIGHLIGHTED</div>
                          <HighlightedText content={currentReview.content} findings={currentReview.findings} />
                        </div>
                        <div>
                          <label className="evidence-label" htmlFor="revised-text">
                            SUGGESTED REWRITE <span className="draft-label">DRAFT · YOU CAN EDIT</span>
                          </label>
                          <textarea
                            id="revised-text"
                            rows={5}
                            value={currentReview.revisedText}
                            onChange={(event) => updateReview(currentReview.id, { revisedText: event.target.value })}
                            onBlur={() => saveRevised(currentReview)}
                            disabled={currentReview.status !== "analysed"}
                          />
                          <div className="button-row">
                            <button className="text-button" onClick={() => copyText(currentReview.revisedText)}>Copy text ↗</button>
                            {currentReview.status === "analysed" && (
                              <button
                                className="text-button"
                                onClick={() =>
                                  updateReview(currentReview.id, {
                                    revisedText: buildRewrite(currentReview.content, currentReview.findings),
                                  })
                                }
                              >
                                Reset to suggestion
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="result-section-title">
                        Findings <span>{currentReview.findings.length}</span>
                      </div>
                      {currentReview.findings.length === 0 ? (
                        <div className="success-box">
                          <span>✓</span>
                          <div>
                            <strong>No issues detected</strong>
                            <p>The content passed the current checks. This does not guarantee compliance.</p>
                          </div>
                        </div>
                      ) : (
                        <div className="finding-list">
                          {currentReview.findings.map((finding) => (
                            <FindingCard key={finding.id} finding={finding} />
                          ))}
                        </div>
                      )}

                      <div className="decision-bar">
                        <StatusPill status={currentReview.status} />
                        {currentReview.status === "analysed" && (
                          <button className="primary-button" onClick={() => submitForReview(currentReview)}>
                            Submit for human review
                          </button>
                        )}
                        {currentReview.status === "pending" && (
                          <button className="text-button" onClick={() => goTo("Review Queue")}>Open in Review Queue →</button>
                        )}
                        {currentReview.status === "approved" && <span className="muted-text">Approved by a reviewer.</span>}
                        {currentReview.status === "rejected" && <span className="muted-text">Rejected by a reviewer. See history.</span>}
                      </div>
                      <p className="disclaimer">
                        Rule-based results are suggestions. Risk levels help prioritise review and are not legal advice.
                      </p>
                    </div>
                  )}
                </div>
              </section>

              <section className="bottom-grid">
                <div className="panel bottom-panel">
                  <div className="bottom-heading">
                    <div><h2>Active brand rules</h2><p>Phrases currently flagged by the checker.</p></div>
                    <button className="text-button" onClick={() => goTo("Brand Rules")}>Manage rules →</button>
                  </div>
                  <div className="rule-chips">
                    {rules.length ? (
                      rules.slice(0, 8).map((rule) => <span className="rule-chip" key={rule.id}>⊘ {rule.phrase}</span>)
                    ) : (
                      <p>No rules added yet.</p>
                    )}
                    {rules.length > 8 && <span className="rule-chip">+{rules.length - 8} more</span>}
                  </div>
                </div>

                <div className="panel bottom-panel">
                  <div className="bottom-heading">
                    <div><h2>Recent reviews</h2><p>Your latest saved content checks.</p></div>
                    <button className="text-button" onClick={() => goTo("Review History")}>View all →</button>
                  </div>
                  {reviews.length === 0 ? (
                    <p className="muted-text">Your review history will appear here.</p>
                  ) : (
                    <div className="recent-list">
                      {reviews.slice(0, 3).map((review) => (
                        <button className="recent-item" key={review.id} onClick={() => openReview(review)}>
                          <span className="recent-file">▤</span>
                          <span className="recent-content">
                            <strong>{review.content.slice(0, 48)}{review.content.length > 48 ? "…" : ""}</strong>
                            <small>{formatDate(review.createdAt)} · {STATUS_LABELS[review.status]}</small>
                          </span>
                          <RiskPill risk={review.risk} />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </>
          )}

          {/* ------------------------- REVIEW QUEUE ------------------------- */}
          {activePage === "Review Queue" && (
            <>
              <section className="page-heading">
                <div>
                  <div className="eyebrow">HUMAN OVERSIGHT</div>
                  <h1>Review queue<span>.</span></h1>
                  <p>Approve or reject submitted content. Every decision is recorded.</p>
                </div>
              </section>

              {!canReview && (
                <div className="info-banner">
                  <span>ⓘ</span>
                  <p>You are signed in as a writer, so you only see your own submissions. Reviewers and admins can approve or reject content.</p>
                </div>
              )}

              {pending.length === 0 ? (
                <section className="panel history-panel">
                  <div className="history-empty">
                    <div className="empty-ring">✓</div>
                    <h3>Nothing waiting for review</h3>
                    <p>Analyse content and choose “Submit for human review” to see it here.</p>
                    <button className="primary-button" onClick={() => goTo("Overview")}>Analyse content →</button>
                  </div>
                </section>
              ) : (
                pending
                  .slice()
                  .sort((a, b) => (a.risk === "High" ? -1 : 0) - (b.risk === "High" ? -1 : 0))
                  .map((review) => <ReviewCard key={review.id} review={review} canReview={canReview} onDecide={decide} />)
              )}

              {decided.length > 0 && (
                <section className="panel history-panel">
                  <div className="panel-heading"><div><h2>Decision history</h2><p>Approved and rejected content.</p></div></div>
                  {decided.map((review) => (
                    <div className="decision-row" key={review.id}>
                      <div>
                        <StatusPill status={review.status} /> <RiskPill risk={review.risk} />
                        <p>{review.finalText || review.revisedText}</p>
                        <small>
                          {review.history.slice(-1)[0].by} · {formatDate(review.history.slice(-1)[0].at)}
                          {review.history.slice(-1)[0].comment && ` · “${review.history.slice(-1)[0].comment}”`}
                        </small>
                      </div>
                    </div>
                  ))}
                </section>
              )}
            </>
          )}

          {/* ------------------------- BRAND RULES ------------------------- */}
          {activePage === "Brand Rules" && (
            <>
              <section className="page-heading">
                <div>
                  <div className="eyebrow">BRAND CONFIGURATION</div>
                  <h1>Brand rules<span>.</span></h1>
                  <p>Define the phrases your content checker should flag, and how serious each one is.</p>
                </div>
              </section>

              <section className="panel rules-page-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Flagged phrases</h2>
                    <p>Matching is case-insensitive and whole-word.</p>
                  </div>
                  <span className="stat-icon blue">◈</span>
                </div>

                <form
                  className="add-rule-form rule-form-extended"
                  onSubmit={(event) => {
                    event.preventDefault();
                    addRule();
                  }}
                >
                  <input
                    value={newRule.phrase}
                    onChange={(event) => setNewRule({ ...newRule, phrase: event.target.value })}
                    placeholder="Phrase, e.g. guaranteed results"
                    aria-label="New flagged phrase"
                  />
                  <select
                    value={newRule.severity}
                    onChange={(event) => setNewRule({ ...newRule, severity: event.target.value })}
                    aria-label="Severity"
                  >
                    {SEVERITIES.map((severity) => <option key={severity}>{severity}</option>)}
                  </select>
                  <input
                    value={newRule.reason}
                    onChange={(event) => setNewRule({ ...newRule, reason: event.target.value })}
                    placeholder="Why it matters (optional)"
                    aria-label="Reason"
                  />
                  <button className="primary-button" type="submit">+ Add rule</button>
                </form>

                <div className="rules-list">
                  {rules.map((rule) => (
                    <div className="rule-row" key={rule.id}>
                      <span className="rule-symbol">⊘</span>
                      <span>
                        <strong>{rule.phrase}</strong>
                        {rule.reason && <small className="rule-reason">{rule.reason}</small>}
                      </span>
                      <span className="rule-type">{rule.code} · {rule.severity}</span>
                      <button className="remove-rule" onClick={() => removeRule(rule.id)} aria-label={`Remove ${rule.phrase}`}>
                        Remove
                      </button>
                    </div>
                  ))}
                  {rules.length === 0 && <p className="muted-text">No rules configured. Add a phrase above to begin.</p>}
                </div>

                <div className="info-banner">
                  <span>ⓘ</span>
                  <p>These are demonstration rules, not legal advice. A flagged phrase means “needs evidence”, not “false”.</p>
                </div>
              </section>
            </>
          )}

          {/* ------------------------- TRUSTED FACTS ------------------------- */}
          {activePage === "Trusted Facts" && (
            <>
              <section className="page-heading">
                <div>
                  <div className="eyebrow">CLAIM DETECTIVE</div>
                  <h1>Trusted facts<span>.</span></h1>
                  <p>Approved facts that content claims are compared against.</p>
                </div>
              </section>

              <section className="panel rules-page-panel">
                <div className="info-banner">
                  <span>ⓘ</span>
                  <p>
                    Facts are entered by people; BrandGuard does not independently verify the sources. “Supported” only
                    means a claim matches a fact listed here. The sample AquaNova company and its facts are fictional.
                    Editing facts marks earlier reviews as possibly affected.
                  </p>
                </div>

                <form
                  className="fact-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    addFact();
                  }}
                >
                  <input value={newFact.name} onChange={(e) => setNewFact({ ...newFact, name: e.target.value })} placeholder="Fact name, e.g. Bottle capacity" aria-label="Fact name" />
                  <select value={newFact.dimension} onChange={(e) => changeFactDimension(e.target.value)} aria-label="Fact type">
                    {Object.entries(DIMENSIONS).map(([key, dimension]) => <option key={key} value={key}>{dimension.label}</option>)}
                  </select>
                  {newFact.dimension === "text" ? (
                    <input value={newFact.valueText} onChange={(e) => setNewFact({ ...newFact, valueText: e.target.value })} placeholder="Fact text, e.g. Stainless steel" aria-label="Fact text" />
                  ) : (
                    <div className="value-unit">
                      <input type="number" min="0" step="any" value={newFact.value} onChange={(e) => setNewFact({ ...newFact, value: e.target.value })} placeholder="Value" aria-label="Value" />
                      <select value={newFact.unit} onChange={(e) => setNewFact({ ...newFact, unit: e.target.value })} aria-label="Unit">
                        {DIMENSIONS[newFact.dimension].units.map((unit) => <option key={unit} value={unit}>{formatQuantity(2, unit).replace("2 ", "")}</option>)}
                      </select>
                    </div>
                  )}
                  <input value={newFact.sourceName} onChange={(e) => setNewFact({ ...newFact, sourceName: e.target.value })} placeholder="Source document name" aria-label="Source name" />
                  <input value={newFact.excerpt} onChange={(e) => setNewFact({ ...newFact, excerpt: e.target.value })} placeholder="Excerpt from the source" aria-label="Source excerpt" />
                  <button className="primary-button" type="submit">+ Add fact</button>
                </form>

                <div className="rules-list">
                  {facts.items.map((fact) => (
                    <div className="fact-row" key={fact.id}>
                      <div>
                        <strong>{fact.name}: {fact.dimension === "text" ? fact.valueText : formatQuantity(fact.value, fact.unit)}</strong>
                        <small className="rule-reason">{fact.sourceName} · v{fact.version}</small>
                        <small className="rule-reason">“{fact.excerpt}”</small>
                        {fact.dimension === "text" && <small className="rule-reason">Reference only: text facts are not auto-checked yet.</small>}
                      </div>
                      <button className="remove-rule" onClick={() => removeFact(fact.id)} aria-label={`Remove ${fact.name}`}>Remove</button>
                    </div>
                  ))}
                  {facts.items.length === 0 && <p className="muted-text">No approved facts yet. Measurable claims will show as unverified.</p>}
                </div>
              </section>
            </>
          )}

          {/* ------------------------- REVIEW HISTORY ------------------------- */}
          {activePage === "Review History" && (
            <>
              <section className="page-heading">
                <div>
                  <div className="eyebrow">AUDIT &amp; ACTIVITY</div>
                  <h1>Review history<span>.</span></h1>
                  <p>Every check is stored with its decisions. Records are never deleted.</p>
                </div>
              </section>

              <section className="panel history-panel">
                {reviews.length === 0 ? (
                  <div className="history-empty">
                    <div className="empty-ring">◷</div>
                    <h3>No reviews yet</h3>
                    <p>Run a content review to start building your history.</p>
                    <button className="primary-button" onClick={() => goTo("Overview")}>Start a review →</button>
                  </div>
                ) : (
                  <>
                    <div className="history-table-heading">
                      <span>CONTENT</span><span>DATE</span><span>RISK</span><span>STATUS</span><span />
                    </div>
                    {reviews.map((review) => (
                      <div className="history-row" key={review.id}>
                        <div className="history-content">
                          <strong>{review.content.slice(0, 65)}{review.content.length > 65 ? "…" : ""}</strong>
                          <small>
                            {review.findings.filter((f) => f.severity !== "Info").length} finding(s)
                            {isStale(review) && <span className="stale-tag">Facts changed since</span>}
                          </small>
                        </div>
                        <span className="history-date">{formatDate(review.createdAt)}</span>
                        <span><RiskPill risk={review.risk} /></span>
                        <span><StatusPill status={review.status} /></span>
                        <button className="text-button" onClick={() => openReview(review)}>Open →</button>
                      </div>
                    ))}
                  </>
                )}
              </section>
            </>
          )}
{/* ------------------------- TEAM MANAGEMENT ------------------------- */}
{activePage === "Team Management" && user.role === "admin" && (
  <TeamManagement />
)}
          <footer className="footer">
            <span>© 2026 BrandGuard AI</span>
            <span><span className="footer-dot" /> Prototype · fictional demo data</span>
          </footer>
        </div>
      </main>
    </div>
  );
}

/* ------------------------------ sign-in gate ------------------------------ */

export default function App() {
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(Boolean(getToken()));

  useEffect(() => {
    if (!getToken()) return;
    api
      .me()
      .then((result) => setSession({ user: result.user, organisation: result.organisation }))
      .catch(() => clearToken())
      .finally(() => setChecking(false));
  }, []);

  const signOut = useCallback(() => {
    clearToken();
    setSession(null);
  }, []);

  // api.js fires this when the server rejects an expired or invalid token.
  useEffect(() => {
    window.addEventListener("bgai-unauthorised", signOut);
    return () => window.removeEventListener("bgai-unauthorised", signOut);
  }, [signOut]);

  if (checking) return <div className="auth-screen"><p>Loading…</p></div>;
  if (!session) return <LoginPage onAuthed={setSession} />;
  return <Workspace key={session.user._id} session={session} onSignOut={signOut} />;
}
