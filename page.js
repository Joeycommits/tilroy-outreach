"use client";
import { useState } from "react";

const ICP_CRITERIA = `Je bent een B2B sales kwalificatie-expert voor Tilroy, een unified commerce POS-oplossing voor non-food retailers in Nederland. Tilroy: unified POS + e-commerce + volledige back-end. Volledig realtime omni-channel. MACH-architectuur. IDEALE KLANT: non-food retailer, 1 fysieke winkel én 1 webshop, max 25 winkels, Nederland. GEEN FIT: food, pure online, buiten NL, 0 webshop, 25+ winkels. Geef ALLEEN dit JSON terug zonder markdown: { "score": 85, "kwalificatie": "STERK FIT", "uitleg": "...", "pijnpunten": ["...", "..."] }`;

const OUTREACH_PROMPT = (lead, icp, hsNote) => `Je bent senior B2B sales copywriter voor Tilroy (unified commerce POS voor non-food retailers NL). Lead: ${lead}. ICP: ${icp}. ${hsNote ? "HubSpot: " + hsNote : ""} Schrijf in het Nederlands, direct, geen buzzwords. Geef ALLEEN dit JSON terug zonder markdown: { "email_subject": "...", "email_body": "...", "linkedin_connect": "...", "linkedin_followup": "..." }`;

const scoreColor = s => s >= 70 ? "#00e5a0" : s >= 40 ? "#f5a623" : "#ff4d6d";
const SECTORS = ["Kleding & Mode","Schoenen","Sport & Outdoor","Interieur & Wonen","Speelgoed & Kids","Sieraden & Accessoires","Drogisterij & Beauty","Elektronica","Huisdieren"];

function safeJson(text) {
  if (!text) return null;
  const clean = text.replace(/```json|```/g, "").trim();
  try { return JSON.parse(clean); } catch(_) {}
  const m = clean.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (m) try { return JSON.parse(m[1]); } catch(_) {}
  return null;
}

async function apiCall(body) {
  const res = await fetch("/api/claude", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, model: "claude-sonnet-4-20250514", max_tokens: 2000 }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
}

async function searchAndParse(sector, n) {
  const searchText = await apiCall({
    tools: [{ type: "web_search_20250305", name: "web_search" }],
    messages: [{ role: "user", content: `Zoek ${n} echte Nederlandse non-food retailers in de sector "${sector}" met fysieke winkels én webshop (1-25 winkels). Geef een simpele opsomming: naam, website, stad, aantal winkels, contactfunctie voor IT/software. Geen JSON, gewoon tekst.` }]
  });
  const jsonText = await apiCall({
    messages: [{ role: "user", content: `Zet deze retailerlijst om naar JSON. Voeg toe: icpScore (0-100), kwalificatie (STERK FIT/MATIGE FIT/GEEN FIT), uitleg (1 zin), 3 pijnpunten rond omni-channel/voorraadbeheer/kassa-webshop.\n\nLijst:\n${searchText}\n\nGeef ALLEEN dit JSON terug, geen uitleg:\n{"leads":[{"bedrijf":"...","sector":"${sector}","website":"...","aantalWinkels":"...","aantalWebshops":"...","locatie":"...","contactFunctie":"...","icpScore":85,"kwalificatie":"STERK FIT","uitleg":"...","pijnpunten":["...","...","..."]}]}` }]
  });
  const parsed = safeJson(jsonText);
  if (!parsed?.leads) throw new Error("Kon leads niet verwerken");
  return parsed.leads;
}

async function claudeJson(messages, system) {
  const text = await apiCall({ messages, system });
  const parsed = safeJson(text);
  if (!parsed) throw new Error("Geen geldig JSON ontvangen");
  return parsed;
}

export default function TilroyTool() {
  const [mainTab, setMainTab] = useState("prospecting");
  const [inputTab, setInputTab] = useState("manual");
  const [sector, setSector] = useState("");
  const [customSector, setCustomSector] = useState("");
  const [aantalLeads, setAantalLeads] = useState(5);
  const [prospecting, setProspecting] = useState(false);
  const [prospects, setProspects] = useState([]);
  const [prospectErr, setProspectErr] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [outreach, setOutreach] = useState({});
  const [outreachLoading, setOutreachLoading] = useState({});
  const [hsStatus, setHsStatus] = useState({});
  const [hsLoading, setHsLoading] = useState({});
  const [manual, setManual] = useState({ bedrijf:"", sector:"", aantalWinkels:"", aantalWebshops:"", contactpersoon:"", functie:"", locatie:"", extraInfo:"" });
  const [paste, setPaste] = useState("");
  const [analysing, setAnalysing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [analysisErr, setAnalysisErr] = useState(null);
  const [copied, setCopied] = useState(null);

  const doCopy = (text, key) => { navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(null), 2000); };

  const runProspecting = async () => {
    const s = sector === "Anders" ? customSector : sector;
    if (!s) return;
    setProspecting(true); setProspects([]); setProspectErr(null); setHsStatus({}); setOutreach({});
    try { setProspects(await searchAndParse(s, aantalLeads)); }
    catch(e) { setProspectErr(e.message); }
    finally { setProspecting(false); }
  };

  const checkHubspot = async (lead, idx) => {
    setHsLoading(p => ({ ...p, [idx]: "checking" }));
    try {
      const text = await apiCall({
        mcp_servers: [{ type: "url", url: "https://mcp.hubspot.com/anthropic", name: "hubspot" }],
        messages: [{ role: "user", content: `Zoek in HubSpot of het bedrijf "${lead.bedrijf}" al bestaat. Geef ALLEEN dit JSON terug: {"gevonden":false,"isKlant":false,"lifecycle":null,"dealStadium":null}` }]
      });
      const status = safeJson(text) || { gevonden: false, isKlant: false };
      setHsStatus(p => ({ ...p, [idx]: status }));
      if (!status.gevonden) {
        setHsLoading(p => ({ ...p, [idx]: "creating" }));
        await apiCall({
          mcp_servers: [{ type: "url", url: "https://mcp.hubspot.com/anthropic", name: "hubspot" }],
          messages: [{ role: "user", content: `Maak in HubSpot een nieuw bedrijf aan: Naam: ${lead.bedrijf}, Website: ${lead.website||""}, Stad: ${lead.locatie||""}, Lifecycle: lead, Beschrijving: ICP Score ${lead.icpScore}/100. Pijnpunten: ${lead.pijnpunten?.join(", ")}.` }]
        });
        setHsStatus(p => ({ ...p, [idx]: { ...status, aangemaakt: true } }));
      }
    } catch(e) { setHsStatus(p => ({ ...p, [idx]: { fout: e.message } })); }
    finally { setHsLoading(p => ({ ...p, [idx]: null })); }
  };

  const generateOutreach = async (lead, idx) => {
    setOutreachLoading(p => ({ ...p, [idx]: true }));
    const ls = `${lead.bedrijf} | ${lead.sector} | ${lead.locatie} | ${lead.aantalWinkels} winkels | ${lead.website} | Contact: ${lead.contactFunctie} | Pijnpunten: ${lead.pijnpunten?.join(", ")}`;
    const is = `Score: ${lead.icpScore}/100 | ${lead.kwalificatie} — ${lead.uitleg}`;
    const hs = hsStatus[idx];
    const hsNote = hs?.gevonden ? `Al in HubSpot. Lifecycle: ${hs.lifecycle||"onbekend"}` : null;
    try { setOutreach(p => ({ ...p, [idx]: await claudeJson([{ role: "user", content: OUTREACH_PROMPT(ls, is, hsNote) }]) })); }
    catch(e) { setOutreach(p => ({ ...p, [idx]: { fout: e.message } })); }
    finally { setOutreachLoading(p => ({ ...p, [idx]: false })); }
  };

  const leadStr = () => inputTab === "hubspot" ? paste : `Bedrijf: ${manual.bedrijf} | Sector: ${manual.sector} | Winkels: ${manual.aantalWinkels} | Webshops: ${manual.aantalWebshops} | Contact: ${manual.contactpersoon} ${manual.functie} | Locatie: ${manual.locatie} | Extra: ${manual.extraInfo}`;

  const runAnalysis = async () => {
    setAnalysing(true); setAnalysisResult(null); setAnalysisErr(null);
    try {
      const icp = await claudeJson([{ role: "user", content: `Analyseer: ${leadStr()}` }], ICP_CRITERIA);
      const out = await claudeJson([{ role: "user", content: OUTREACH_PROMPT(leadStr(), `Score: ${icp.score}/100 | ${icp.kwalificatie} — ${icp.uitleg} | Pijnpunten: ${icp.pijnpunten?.join(", ")}`, null) }]);
      setAnalysisResult({ icp, out });
    } catch(e) { setAnalysisErr(e.message); }
    finally { setAnalysing(false); }
  };

  const canAnalyse = () => inputTab === "hubspot" ? paste.trim().length > 20 : manual.bedrijf && manual.sector && manual.aantalWinkels;

  const C = { bg:"#0a0a0f", card:"#0f0f1a", border:"#1e1e2e", dim:"#5a5a7a", text:"#e8e8f0", sub:"#c0c0d8", inp:"#2a2a3e" };
  const card = { background:C.card, border:`1px solid ${C.border}`, borderRadius:"16px", overflow:"hidden" };
  const lbl = { display:"block", fontSize:"12px", color:C.dim, marginBottom:"6px", fontWeight:"500" };
  const inp = { width:"100%", background:C.bg, border:`1px solid ${C.inp}`, borderRadius:"8px", padding:"10px 14px", color:C.text, fontSize:"14px", fontFamily:"system-ui,sans-serif", outline:"none", boxSizing:"border-box" };
  const primaryBtn = (on) => ({ width:"100%", padding:"14px", background:on?"linear-gradient(135deg,#00e5a0,#0099ff)":C.border, border:"none", borderRadius:"10px", color:on?"#0a0a0f":C.dim, fontWeight:"700", fontSize:"14px", cursor:on?"pointer":"not-allowed", transition:"all 0.2s" });
  const chipBtn = (on, col="#00e5a0") => ({ padding:"7px 14px", background:`${col}${on?"20":"08"}`, border:`1px solid ${col}${on?"50":"20"}`, borderRadius:"6px", color:on?col:C.dim, fontSize:"12px", cursor:"pointer", fontWeight:"500" });

  const Tag = ({ col, children }) => <span style={{ fontSize:"12px", color:col, padding:"5px 10px", background:`${col}15`, border:`1px solid ${col}30`, borderRadius:"6px" }}>{children}</span>;

  const HsTag = ({ idx }) => {
    const hs = hsStatus[idx]; const l = hsLoading[idx];
    if (l === "checking") return <Tag col="#f5a623">🔄 HubSpot controleren...</Tag>;
    if (l === "creating") return <Tag col="#f5a623">➕ Aanmaken...</Tag>;
    if (!hs) return null;
    if (hs.fout) return <Tag col="#ff4d6d">⚠️ {hs.fout}</Tag>;
    if (hs.isKlant) return <Tag col="#ff4d6d">🚫 Bestaande klant</Tag>;
    if (hs.aangemaakt) return <Tag col="#00e5a0">✅ Aangemaakt in HubSpot</Tag>;
    if (hs.gevonden) return <Tag col="#f5a623">⚠️ Al in HubSpot — {hs.lifecycle||"onbekend"}</Tag>;
    return null;
  };

  const Msg = ({ k, icon, title, subject, body, limit }) => (
    <div style={{ background:C.bg, border:`1px solid ${C.border}`, borderRadius:"12px", overflow:"hidden" }}>
      <div style={{ padding:"12px 18px", borderBottom:`1px solid ${C.border}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <span style={{ fontWeight:"600", fontSize:"13px" }}>{icon} {title}</span>
        <button onClick={() => doCopy(subject?`Onderwerp: ${subject}\n\n${body}`:body, k)} style={chipBtn(copied===k)}>
          {copied===k?"✓ Gekopieerd":"Kopieer"}
        </button>
      </div>
      <div style={{ padding:"16px 18px" }}>
        {subject && <div style={{ padding:"8px 12px", background:C.card, borderRadius:"6px", fontSize:"13px", fontWeight:"500", marginBottom:"12px", border:`1px solid ${C.border}` }}>{subject}</div>}
        <div style={{ fontSize:"13px", lineHeight:"1.8", color:C.sub, whiteSpace:"pre-wrap" }}>{body}</div>
        {limit && <div style={{ marginTop:"8px", fontSize:"11px", color:C.dim }}>{body?.length}/{limit} tekens</div>}
      </div>
    </div>
  );

  const IcpBlock = ({ icp }) => (
    <div style={{ ...card, border:`1px solid ${scoreColor(icp.score)}33`, padding:"24px", position:"relative", overflow:"hidden" }}>
      <div style={{ position:"absolute", top:0, right:0, width:"160px", height:"160px", background:`radial-gradient(circle,${scoreColor(icp.score)}15 0%,transparent 70%)` }}/>
      <div style={{ fontSize:"11px", color:C.dim, marginBottom:"12px", letterSpacing:"1px" }}>ICP KWALIFICATIE</div>
      <div style={{ display:"flex", alignItems:"center", gap:"20px", marginBottom:"16px" }}>
        <div style={{ textAlign:"center" }}>
          <div style={{ fontSize:"44px", fontWeight:"800", color:scoreColor(icp.score), lineHeight:"1" }}>{icp.score}</div>
          <div style={{ fontSize:"11px", color:C.dim }}>/100</div>
        </div>
        <div>
          <div style={{ display:"inline-block", padding:"5px 12px", background:`${scoreColor(icp.score)}20`, border:`1px solid ${scoreColor(icp.score)}50`, borderRadius:"6px", color:scoreColor(icp.score), fontWeight:"600", fontSize:"12px", marginBottom:"6px" }}>{icp.kwalificatie}</div>
          <div style={{ fontSize:"13px", color:"#a0a0c0", lineHeight:"1.6" }}>{icp.uitleg}</div>
        </div>
      </div>
      <div style={{ display:"flex", gap:"8px", flexWrap:"wrap" }}>
        {icp.pijnpunten?.map((p,i) => <span key={i} style={{ padding:"6px 12px", background:"#1a1a2e", borderRadius:"6px", fontSize:"12px", color:C.sub, border:`1px solid ${C.inp}` }}>🎯 {p}</span>)}
      </div>
    </div>
  );

  return (
    <div style={{ minHeight:"100vh", background:C.bg, fontFamily:"system-ui,sans-serif", color:C.text }}>
      <div style={{ borderBottom:`1px solid ${C.border}`, padding:"18px 32px", display:"flex", alignItems:"center", gap:"14px", background:"linear-gradient(180deg,#0f0f1a,#0a0a0f)" }}>
        <div style={{ width:"34px", height:"34px", background:"linear-gradient(135deg,#00e5a0,#0099ff)", borderRadius:"8px", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:"800", fontSize:"17px", color:"#0a0a0f" }}>T</div>
        <div>
          <div style={{ fontWeight:"800", fontSize:"17px" }}>Tilroy <span style={{ color:"#00e5a0" }}>Outreach</span></div>
          <div style={{ fontSize:"11px", color:C.dim }}>AI prospecting · HubSpot sync · Outreach generator</div>
        </div>
        <div style={{ marginLeft:"auto", padding:"5px 12px", background:"#001a0f", border:"1px solid #00e5a030", borderRadius:"8px", fontSize:"12px", color:"#00e5a0" }}>🔗 HubSpot verbonden</div>
      </div>

      <div style={{ display:"flex", borderBottom:`1px solid ${C.border}`, background:C.card }}>
        {[{k:"prospecting",l:"🔍 Prospecting",d:"Automatisch leads zoeken"},{k:"outreach",l:"✉️ Outreach",d:"Handmatig of HubSpot"}].map(t => (
          <button key={t.k} onClick={() => setMainTab(t.k)} style={{ flex:1, padding:"14px", background:mainTab===t.k?"#1a1a2e":"transparent", border:"none", borderBottom:mainTab===t.k?"2px solid #00e5a0":"2px solid transparent", color:mainTab===t.k?"#00e5a0":C.dim, fontWeight:"500", fontSize:"14px", cursor:"pointer", textAlign:"center" }}>
            <div>{t.l}</div><div style={{ fontSize:"11px", opacity:0.6, marginTop:"2px" }}>{t.d}</div>
          </button>
        ))}
      </div>

      <div style={{ maxWidth:"880px", margin:"0 auto", padding:"32px 20px" }}>
        {mainTab === "prospecting" && (
          <div>
            <div style={{ ...card, marginBottom:"24px" }}>
              <div style={{ padding:"22px 26px" }}>
                <div style={{ fontSize:"13px", color:C.dim, marginBottom:"18px" }}>Claude zoekt Nederlandse non-food retailers, checkt HubSpot op duplicaten en maakt nieuwe leads automatisch aan.</div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"14px", marginBottom:"14px" }}>
                  <div>
                    <label style={lbl}>Sector *</label>
                    <select value={sector} onChange={e => setSector(e.target.value)} style={{ ...inp, appearance:"none", cursor:"pointer" }}>
                      <option value="">Kies sector...</option>
                      {SECTORS.map(s => <option key={s}>{s}</option>)}
                      <option value="Anders">Anders (zelf invullen)</option>
                    </select>
                  </div>
                  <div>
                    <label style={lbl}>Aantal leads</label>
                    <select value={aantalLeads} onChange={e => setAantalLeads(Number(e.target.value))} style={{ ...inp, appearance:"none", cursor:"pointer" }}>
                      {[3,5,8,10].map(n => <option key={n} value={n}>{n} leads</option>)}
                    </select>
                  </div>
                </div>
                {sector === "Anders" && <div style={{ marginBottom:"14px" }}><label style={lbl}>Sector omschrijven</label><input value={customSector} onChange={e => setCustomSector(e.target.value)} placeholder="bijv. baby & kind, hobby..." style={inp}/></div>}
                <button onClick={runProspecting} disabled={!sector||prospecting} style={primaryBtn(!(!sector||prospecting))}>
                  {prospecting?"⏳ Zoeken naar leads...":"🔍 Zoek Leads"}
                </button>
              </div>
            </div>

            {prospectErr && <div style={{ background:"#1a0a0f", border:"1px solid #ff4d6d", borderRadius:"10px", padding:"12px 16px", color:"#ff4d6d", fontSize:"13px", marginBottom:"18px" }}>⚠️ {prospectErr}</div>}

            {prospects.length > 0 && (
              <div style={{ display:"flex", flexDirection:"column", gap:"14px" }}>
                <div style={{ fontSize:"13px", color:C.dim }}>{prospects.length} leads gevonden</div>
                {prospects.map((lead, idx) => {
                  const isBlocked = hsStatus[idx]?.isKlant;
                  const isOpen = expanded === idx;
                  return (
                    <div key={idx} style={{ ...card, border:`1px solid ${isOpen?scoreColor(lead.icpScore)+"44":C.border}` }}>
                      <div onClick={() => setExpanded(isOpen?null:idx)} style={{ padding:"18px 22px", cursor:"pointer", display:"flex", alignItems:"flex-start", gap:"16px" }}>
                        <div style={{ textAlign:"center", minWidth:"48px" }}>
                          <div style={{ fontSize:"24px", fontWeight:"800", color:scoreColor(lead.icpScore), lineHeight:"1" }}>{lead.icpScore}</div>
                          <div style={{ fontSize:"10px", color:C.dim }}>/100</div>
                        </div>
                        <div style={{ flex:1 }}>
                          <div style={{ display:"flex", alignItems:"center", gap:"8px", marginBottom:"4px", flexWrap:"wrap" }}>
                            <span style={{ fontWeight:"700", fontSize:"15px" }}>{lead.bedrijf}</span>
                            <span style={{ padding:"3px 9px", background:`${scoreColor(lead.icpScore)}20`, border:`1px solid ${scoreColor(lead.icpScore)}50`, borderRadius:"4px", color:scoreColor(lead.icpScore), fontSize:"11px", fontWeight:"600" }}>{lead.kwalificatie}</span>
                          </div>
                          <div style={{ fontSize:"12px", color:"#6060a0", marginBottom:"8px" }}>{lead.sector} · {lead.locatie} · {lead.aantalWinkels} winkel(s) · {lead.website}</div>
                          <div style={{ display:"flex", gap:"6px", flexWrap:"wrap" }}>
                            {lead.pijnpunten?.map((p,i) => <span key={i} style={{ padding:"3px 9px", background:"#1a1a2e", borderRadius:"5px", fontSize:"11px", color:"#9090b0", border:`1px solid ${C.inp}` }}>🎯 {p}</span>)}
                          </div>
                        </div>
                        <span style={{ color:C.dim, fontSize:"14px", paddingTop:"4px" }}>{isOpen?"▲":"▼"}</span>
                      </div>
                      {isOpen && (
                        <div style={{ borderTop:`1px solid ${C.border}`, padding:"18px 22px", display:"flex", flexDirection:"column", gap:"12px" }}>
                          <div style={{ fontSize:"13px", color:"#7070a0" }}>{lead.uitleg}</div>
                          <div style={{ display:"flex", alignItems:"center", gap:"10px", flexWrap:"wrap" }}>
                            {!hsStatus[idx] && !hsLoading[idx] && (
                              <button onClick={() => checkHubspot(lead, idx)} style={{ ...chipBtn(true), padding:"8px 16px", fontSize:"13px" }}>🔗 Check & sync HubSpot</button>
                            )}
                            <HsTag idx={idx}/>
                          </div>
                          {!isBlocked && (
                            <>
                              {!outreach[idx] && !outreachLoading[idx] && (
                                <button onClick={() => generateOutreach(lead, idx)} style={primaryBtn(true)}>⚡ Genereer Outreach voor {lead.bedrijf}</button>
                              )}
                              {outreachLoading[idx] && <div style={{ textAlign:"center", padding:"14px", color:C.dim, fontSize:"13px" }}>⏳ Outreach genereren...</div>}
                              {outreach[idx]?.fout && <div style={{ background:"#1a0a0f", border:"1px solid #ff4d6d", borderRadius:"8px", padding:"10px 14px", color:"#ff4d6d", fontSize:"12px" }}>⚠️ {outreach[idx].fout}</div>}
                              {outreach[idx] && !outreach[idx].fout && (
                                <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
                                  <Msg k={`em${idx}`} icon="📧" title="E-mail" subject={outreach[idx].email_subject} body={outreach[idx].email_body}/>
                                  <Msg k={`lc${idx}`} icon="🔗" title="LinkedIn — Connectieverzoek" body={outreach[idx].linkedin_connect} limit={300}/>
                                  <Msg k={`lf${idx}`} icon="💬" title="LinkedIn — Follow-up" body={outreach[idx].linkedin_followup} limit={500}/>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {mainTab === "outreach" && (
          <div>
            <div style={{ ...card, marginBottom:"24px" }}>
              <div style={{ display:"flex", borderBottom:`1px solid ${C.border}` }}>
                {["manual","hubspot"].map(t => (
                  <button key={t} onClick={() => setInputTab(t)} style={{ flex:1, padding:"13px", background:inputTab===t?"#1a1a2e":"transparent", border:"none", borderBottom:inputTab===t?"2px solid #00e5a0":"2px solid transparent", color:inputTab===t?"#00e5a0":C.dim, fontWeight:"500", fontSize:"13px", cursor:"pointer" }}>
                    {t==="manual"?"✏️ Handmatige invoer":"🔗 HubSpot / Sales Navigator"}
                  </button>
                ))}
              </div>
              <div style={{ padding:"24px" }}>
                {inputTab === "manual" ? (
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"14px" }}>
                    {[{k:"bedrijf",l:"Bedrijfsnaam *",p:"bijv. Scotch & Soda"},{k:"sector",l:"Sector *",p:"bijv. kleding"},{k:"aantalWinkels",l:"Winkels *",p:"bijv. 5"},{k:"aantalWebshops",l:"Webshops",p:"bijv. 2"},{k:"contactpersoon",l:"Contactpersoon",p:"bijv. Jan de Vries"},{k:"functie",l:"Functie",p:"bijv. Head of E-commerce"},{k:"locatie",l:"Locatie",p:"bijv. Amsterdam"}].map(({k,l,p}) => (
                      <div key={k}><label style={lbl}>{l}</label><input value={manual[k]} onChange={e => setManual({...manual,[k]:e.target.value})} placeholder={p} style={inp}/></div>
                    ))}
                    <div style={{ gridColumn:"1/-1" }}><label style={lbl}>Extra info</label><textarea value={manual.extraInfo} onChange={e => setManual({...manual,extraInfo:e.target.value})} rows={3} placeholder="LinkedIn bio, nieuws..." style={{ ...inp, resize:"vertical" }}/></div>
                  </div>
                ) : (
                  <div><label style={lbl}>Plak data vanuit HubSpot of Sales Navigator</label><textarea value={paste} onChange={e => setPaste(e.target.value)} rows={9} placeholder="Plak hier contactdata..." style={{ ...inp, resize:"vertical", lineHeight:"1.6" }}/></div>
                )}
              </div>
              <div style={{ padding:"0 24px 24px" }}>
                <button onClick={runAnalysis} disabled={!canAnalyse()||analysing} style={primaryBtn(canAnalyse()&&!analysing)}>
                  {analysing?"⏳ Analyseren...":"⚡ Analyseer & Genereer Outreach"}
                </button>
              </div>
            </div>
            {analysisErr && <div style={{ background:"#1a0a0f", border:"1px solid #ff4d6d", borderRadius:"10px", padding:"12px 16px", color:"#ff4d6d", fontSize:"13px", marginBottom:"18px" }}>⚠️ {analysisErr}</div>}
            {analysisResult && (
              <div style={{ display:"flex", flexDirection:"column", gap:"16px" }}>
                <IcpBlock icp={analysisResult.icp}/>
                <Msg k="email" icon="📧" title="E-mail" subject={analysisResult.out.email_subject} body={analysisResult.out.email_body}/>
                <Msg k="lc" icon="🔗" title="LinkedIn — Connectieverzoek" body={analysisResult.out.linkedin_connect} limit={300}/>
                <Msg k="lf" icon="💬" title="LinkedIn — Follow-up" body={analysisResult.out.linkedin_followup} limit={500}/>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
