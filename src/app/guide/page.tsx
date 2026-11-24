import { CHECKS, GUIDE, PROCESS_STEPS } from "@/lib/checks";

export default function GuidePage() {
  return (
    <div className="guide">
      <div className="page-head">
        <div>
          <div className="eyebrow mono">{GUIDE.subtitle}</div>
          <h1>{GUIDE.title}</h1>
          <p className="lead">{GUIDE.tagline}</p>
          <p className="muted">{GUIDE.intro}</p>
        </div>
      </div>

      <div className="guide-facts">
        <div>
          <span className="muted small">Audit owner</span>
          {GUIDE.auditOwner}
        </div>
        <div>
          <span className="muted small">Test on</span>
          {GUIDE.testOn}
        </div>
        <div>
          <span className="muted small">Final approval</span>
          {GUIDE.finalApproval}
        </div>
      </div>

      <div className="callout info guide-rule">
        <strong>{GUIDE.buttonsRule}</strong>
        <div className="muted">{GUIDE.buttonsRuleDetail}</div>
      </div>

      <div className="checks-head">
        <span>Required audit checks</span>
        <span className="muted small">{GUIDE.checksRule}</span>
      </div>
      <div className="guide-grid">
        {CHECKS.map((c) => (
          <div key={c.code} className="panel guide-check">
            <div className="mono muted">{c.code}</div>
            <div className="check-title">{c.title}</div>
            <ul className="check-rules">
              {c.rules.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="checks-head">
        <span>{GUIDE.processHeadline}</span>
        <span className="muted small">{GUIDE.processDetail}</span>
      </div>
      <ol className="stepper">
        {PROCESS_STEPS.map((s) => (
          <li key={s.code} className="step">
            <span className="step-code mono">{s.code}</span>
            <div>
              <div className="step-title">{s.title}</div>
              <div className="muted small">{s.detail}</div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
