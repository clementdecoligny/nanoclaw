"""HTML renderer for the expense dashboard. Self-contained output (no external
assets, CSP-safe). Palette from the dataviz reference instance, validated."""
import json


def eur(n):
    try:
        n = round(n)
    except Exception:
        return "—"
    s = f"{abs(n):,}".replace(",", " ")
    return f"{'-' if n < 0 else ''}€{s}"


def render(m):
    months = m["months"]
    # Pretty month labels
    def lbl(ym):
        y, mo = ym.split("-")
        names = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
                 "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        return f"{names[int(mo)]} {y[2:]}"

    latest = m["latest"]
    inc = m["income"][latest]
    spd = m["spend"][latest]
    net = m["net"][latest]
    rate = m["rate"][latest]

    # Trailing 6-month averages for hero context
    tail = months[-6:]
    avg_spend = round(sum(m["spend"][x] for x in tail) / len(tail))
    inc_months = [x for x in tail if m["income"][x] > 0]
    avg_inc = round(sum(m["income"][x] for x in inc_months) / len(inc_months)) if inc_months else 0
    avg_net = round(sum(m["net"][x] for x in tail) / len(tail))

    payload = {
        "months": months,
        "labels": [lbl(x) for x in months],
        "income": [m["income"][x] for x in months],
        "spend": [m["spend"][x] for x in months],
        "net": [m["net"][x] for x in months],
        "rate": [m["rate"][x] for x in months],
        "stack": m["stack"],
        "topCats": m["top_cats"],
        "catTotals": m["cat_totals"],
        "catOrder": m["cat_order"],
        "anomalies": m["anomalies"],
        "big": m["big_latest"],
    }
    fr = m["fairness"]

    # Anomaly rows (server-rendered so the page reads without JS too)
    anom_rows = ""
    for a in m["anomalies"]:
        up = a["delta"] > 0
        arrow = "▲" if up else "▼"
        cls = "up" if up else "down"
        base_txt = "nouveau / était €0" if a["base"] == 0 else f"moy. {eur(a['base'])}"
        rel = f"{'+' if up else ''}{a['rel']}%" if a["base"] > 0 else "nouveau"
        anom_rows += (
            f'<tr><td class="cat">{a["cat"]}</td>'
            f'<td class="num">{eur(a["cur"])}</td>'
            f'<td class="num muted">{base_txt}</td>'
            f'<td class="num {cls}">{arrow} {eur(abs(a["delta"]))} <span class="rel">{rel}</span></td></tr>'
        )
    if not anom_rows:
        anom_rows = '<tr><td colspan="4" class="muted">Aucun écart notable ce mois-ci.</td></tr>'

    big_rows = ""
    for b in m["big_latest"]:
        big_rows += (
            f'<tr><td class="muted">{b["date"][5:]}</td>'
            f'<td>{b["desc"]}</td>'
            f'<td class="cat">{b["cat"]}</td>'
            f'<td class="num">{eur(b["amt"])}</td></tr>'
        )
    if not big_rows:
        big_rows = '<tr><td colspan="4" class="muted">Aucune grosse transaction.</td></tr>'

    rate_txt = f"{rate}%" if rate is not None else "n/d"
    rate_class = "good" if (rate is not None and rate >= 0) else "bad"

    return TEMPLATE.replace("__PAYLOAD__", json.dumps(payload)) \
        .replace("__LATEST__", lbl(latest)) \
        .replace("__INC__", eur(inc)) \
        .replace("__SPD__", eur(spd)) \
        .replace("__NET__", eur(net)) \
        .replace("__RATE__", rate_txt) \
        .replace("__RATECLASS__", rate_class) \
        .replace("__AVGINC__", eur(avg_inc)) \
        .replace("__AVGSPD__", eur(avg_spend)) \
        .replace("__AVGNET__", eur(avg_net)) \
        .replace("__FR_CLE_INC__", eur(fr["clement_income"])) \
        .replace("__FR_LOL_INC__", eur(fr["lola_income"])) \
        .replace("__FR_CLE_SHARE__", eur(fr["clement_share"])) \
        .replace("__FR_LOL_SHARE__", eur(fr["lola_share"])) \
        .replace("__FR_CLE_PCT__", str(fr["clement_pct"])) \
        .replace("__FR_LOL_PCT__", str(fr["lola_pct"])) \
        .replace("__FR_TARGET__", eur(fr["target"])) \
        .replace("__ANOMROWS__", anom_rows) \
        .replace("__BIGROWS__", big_rows) \
        .replace("__GEN__", m["generated"]) \
        .replace("__NTX__", str(m["n_tx"])) \
        .replace("__NMONTHS__", str(len(months)))


TEMPLATE = r"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Dépenses du foyer</title>
<style>
:root{
  --plane:#f9f9f7; --surface:#fcfcfb; --ink:#0b0b0b; --ink2:#52514e;
  --muted:#898781; --grid:#e1e0d9; --axis:#c3c2b7; --border:rgba(11,11,11,.10);
  --good:#006300; --bad:#d03b3b; --warn:#eda100;
  --s1:#2a78d6;--s2:#1baf7a;--s3:#eda100;--s4:#008300;--s5:#4a3aa7;
  --s6:#e34948;--s7:#e87ba4;--s8:#eb6834;--s9:#898781;
}
@media (prefers-color-scheme:dark){:root{
  --plane:#0d0d0d;--surface:#1a1a19;--ink:#fff;--ink2:#c3c2b7;--muted:#898781;
  --grid:#2c2c2a;--axis:#383835;--border:rgba(255,255,255,.10);
  --good:#0ca30c;--bad:#e66767;--warn:#c98500;
  --s1:#3987e5;--s2:#199e70;--s3:#c98500;--s4:#008300;--s5:#9085e9;
  --s6:#e66767;--s7:#d55181;--s8:#d95926;--s9:#898781;
}}
*{box-sizing:border-box}
body{margin:0;background:var(--plane);color:var(--ink);
  font-family:system-ui,-apple-system,"Segoe UI",sans-serif;line-height:1.45;
  -webkit-font-smoothing:antialiased}
.wrap{max-width:1080px;margin:0 auto;padding:32px 20px 64px}
h1{font-size:22px;margin:0 0 2px;font-weight:650}
.sub{color:var(--ink2);font-size:13px;margin:0 0 24px}
.sub b{color:var(--ink);font-weight:600}
.card{background:var(--surface);border:1px solid var(--border);border-radius:14px;
  padding:20px;margin-bottom:18px}
.card h2{font-size:13px;text-transform:uppercase;letter-spacing:.04em;
  color:var(--ink2);margin:0 0 4px;font-weight:600}
.card .hint{font-size:12px;color:var(--muted);margin:0 0 16px}
/* hero */
.hero{display:grid;grid-template-columns:1.3fr 1fr 1fr 1fr;gap:1px;
  background:var(--border);border-radius:12px;overflow:hidden}
.hero>div{background:var(--surface);padding:18px 18px 16px}
.hero .k{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin-bottom:6px}
.hero .v{font-size:30px;font-weight:660;letter-spacing:-.01em}
.hero .v.small{font-size:26px}
.hero .foot{font-size:11.5px;color:var(--muted);margin-top:5px}
.good{color:var(--good)} .bad{color:var(--bad)}
.pill{display:inline-block;font-size:11px;font-weight:600;padding:2px 8px;border-radius:20px;
  background:color-mix(in srgb,var(--good) 14%,transparent);color:var(--good)}
.pill.bad{background:color-mix(in srgb,var(--bad) 14%,transparent);color:var(--bad)}
/* charts */
svg{display:block;width:100%;height:auto;overflow:visible}
.axis text{fill:var(--muted);font-size:11px}
.axis line{stroke:var(--grid);stroke-width:1}
.baseline{stroke:var(--axis);stroke-width:1}
.legend{display:flex;flex-wrap:wrap;gap:12px 18px;margin-top:14px;font-size:12px;color:var(--ink2)}
.legend span{display:inline-flex;align-items:center;gap:6px}
.legend i{width:11px;height:11px;border-radius:3px;display:inline-block}
/* tables */
table{width:100%;border-collapse:collapse;font-size:13px}
th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.03em;
  color:var(--muted);font-weight:600;padding:0 10px 8px;border-bottom:1px solid var(--border)}
td{padding:9px 10px;border-bottom:1px solid var(--border)}
tr:last-child td{border-bottom:0}
.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.cat{font-weight:600}
.muted{color:var(--muted)}
td.up{color:var(--bad)} td.down{color:var(--good)}
.rel{font-size:11px;color:var(--muted);margin-left:2px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:18px}
.tooltip{position:fixed;pointer-events:none;background:var(--surface);
  border:1px solid var(--border);border-radius:8px;padding:8px 10px;font-size:12px;
  box-shadow:0 4px 16px rgba(0,0,0,.12);opacity:0;transition:opacity .08s;z-index:10;
  color:var(--ink);white-space:nowrap}
.tooltip b{font-weight:600}
.note{font-size:12px;color:var(--ink2);background:color-mix(in srgb,var(--warn) 10%,transparent);
  border-left:3px solid var(--warn);padding:8px 12px;border-radius:0 8px 8px 0;margin:0 0 4px}
.foot-note{font-size:11.5px;color:var(--muted);margin-top:26px;text-align:center}
@media(max-width:760px){.hero{grid-template-columns:1fr 1fr}.grid2{grid-template-columns:1fr}
  .hero .v{font-size:26px}}
</style>
</head>
<body>
<div class="wrap">
  <h1>Dépenses du foyer</h1>
  <p class="sub">Où va l'argent &amp; combien on épargne · <b>__NMONTHS__ mois</b>, __NTX__ transactions · dernier mois : <b>__LATEST__</b></p>

  <!-- HERO -->
  <div class="card">
    <div class="hero">
      <div>
        <div class="k">__LATEST__ · épargne nette</div>
        <div class="v __RATECLASS__">__NET__</div>
        <div class="foot">taux d'épargne <span class="pill __RATECLASS__">__RATE__</span> · moy. 6 mois __AVGNET__</div>
      </div>
      <div>
        <div class="k">Revenus</div>
        <div class="v small">__INC__</div>
        <div class="foot">moy. 6 mois __AVGINC__</div>
      </div>
      <div>
        <div class="k">Dépenses</div>
        <div class="v small">__SPD__</div>
        <div class="foot">moy. 6 mois __AVGSPD__</div>
      </div>
      <div>
        <div class="k">Compte commun · cible</div>
        <div class="v small">__FR_TARGET__</div>
        <div class="foot">Clément __FR_CLE_SHARE__ · Lola __FR_LOL_SHARE__</div>
      </div>
    </div>
  </div>

  <!-- SAVINGS OVER TIME -->
  <div class="card">
    <h2>Revenus vs dépenses — épargne-t-on ?</h2>
    <p class="hint">Barres = épargne nette par mois (revenus − dépenses). Lignes = revenus et dépenses. Revenus depuis la table income ; dépenses = tous les mouvements (les remboursements réduisent le total).</p>
    <div id="netChart"></div>
    <div class="legend">
      <span><i style="background:var(--s1)"></i>Revenus</span>
      <span><i style="background:var(--s8)"></i>Dépenses</span>
      <span><i style="background:var(--s2)"></i>Épargne nette (barre)</span>
    </div>
  </div>

  <!-- WHERE MONEY GOES -->
  <div class="card">
    <h2>Où va l'argent</h2>
    <p class="hint">Dépenses mensuelles par catégorie, empilées. Top 8 catégories ; le reste regroupé dans « Autre ».</p>
    <div id="stackChart"></div>
    <div class="legend" id="stackLegend"></div>
  </div>

  <div class="grid2">
    <!-- ANOMALIES -->
    <div class="card">
      <h2>Inhabituel ce mois-ci</h2>
      <p class="hint">Catégories de __LATEST__ qui ont beaucoup bougé vs leur moyenne 3 mois.</p>
      <table>
        <thead><tr><th>Catégorie</th><th class="num">Ce mois</th><th class="num">Référence</th><th class="num">Écart</th></tr></thead>
        <tbody>__ANOMROWS__</tbody>
      </table>
    </div>
    <!-- BIG TRANSACTIONS -->
    <div class="card">
      <h2>Plus grosses transactions</h2>
      <p class="hint">Plus grosses sorties de __LATEST__ (&gt; €300).</p>
      <table>
        <thead><tr><th>Date</th><th>Description</th><th>Catégorie</th><th class="num">Montant</th></tr></thead>
        <tbody>__BIGROWS__</tbody>
      </table>
    </div>
  </div>

  <!-- FAIRNESS -->
  <div class="card">
    <h2>Contribution au compte commun — __LATEST__</h2>
    <p class="hint">Cible __FR_TARGET__/mois, répartie au prorata des revenus personnels (formule d'Edmond).</p>
    <table>
      <thead><tr><th>Personne</th><th class="num">Revenus</th><th class="num">Part des revenus</th><th class="num">Part du commun</th></tr></thead>
      <tbody>
        <tr><td class="cat">Clément</td><td class="num">__FR_CLE_INC__</td><td class="num muted">__FR_CLE_PCT__%</td><td class="num">__FR_CLE_SHARE__</td></tr>
        <tr><td class="cat">Lola</td><td class="num">__FR_LOL_INC__</td><td class="num muted">__FR_LOL_PCT__%</td><td class="num">__FR_LOL_SHARE__</td></tr>
      </tbody>
    </table>
  </div>

  <p class="foot-note">Généré le __GEN__ depuis finance.db · relancer build_dashboard.py après ajout d'un mois.</p>
</div>

<div class="tooltip" id="tt"></div>
<script>
const D = __PAYLOAD__;
const SC = ['--s1','--s2','--s3','--s4','--s5','--s6','--s7','--s8','--s9']
  .map(v=>getComputedStyle(document.documentElement).getPropertyValue(v).trim());
const css = k=>getComputedStyle(document.documentElement).getPropertyValue(k).trim();
const tt = document.getElementById('tt');
function showTT(html,x,y){tt.innerHTML=html;tt.style.opacity=1;
  tt.style.left=Math.min(x+14,innerWidth-tt.offsetWidth-8)+'px';
  tt.style.top=(y-10)+'px';}
function hideTT(){tt.style.opacity=0;}
const eur=n=>{n=Math.round(n);const s=Math.abs(n).toLocaleString('fr-FR').replace(/ /g,' ');
  return (n<0?'-':'')+'€'+s;};
const SVGNS='http://www.w3.org/2000/svg';
function el(t,a){const e=document.createElementNS(SVGNS,t);for(const k in a)e.setAttribute(k,a[k]);return e;}

// ---- Net / income / spend chart ----
(function(){
  const W=1000,H=340,mL=54,mR=16,mT=16,mB=34;
  const iw=W-mL-mR, ih=H-mT-mB;
  const n=D.months.length;
  const maxV=Math.max(...D.income,...D.spend, ...D.net.map(Math.abs))*1.1||1;
  const minNet=Math.min(0,...D.net);
  const top=Math.max(maxV, ...D.income,...D.spend);
  const bot=Math.min(0,minNet);
  const sc=v=>mT+ih*(1-(v-bot)/(top-bot));
  const bw=iw/n;
  const svg=el('svg',{viewBox:`0 0 ${W} ${H}`,role:'img'});
  // gridlines
  const g=el('g',{class:'axis'});
  const ticks=4;
  for(let i=0;i<=ticks;i++){const v=bot+(top-bot)*i/ticks;const y=sc(v);
    g.appendChild(el('line',{x1:mL,y1:y,x2:W-mR,y2:y}));
    const t=el('text',{x:mL-8,y:y+3,'text-anchor':'end'});t.textContent=eur(v);g.appendChild(t);}
  svg.appendChild(g);
  // zero baseline
  svg.appendChild(el('line',{x1:mL,y1:sc(0),x2:W-mR,y2:sc(0),class:'baseline'}));
  // net bars
  D.net.forEach((v,i)=>{const x=mL+bw*i+bw*0.2;const w=bw*0.6;
    const y0=sc(0),y1=sc(v);const y=Math.min(y0,y1),h=Math.max(2,Math.abs(y1-y0));
    const r=el('rect',{x:x,y:y,width:w,height:h,rx:4,
      fill:v>=0?SC[1]:css('--bad'),opacity:.85});
    r.addEventListener('mousemove',e=>showTT(
      `<b>${D.labels[i]}</b><br>Net ${eur(v)}<br>Rev. ${eur(D.income[i])} · Dép. ${eur(D.spend[i])}`,
      e.clientX,e.clientY));
    r.addEventListener('mouseleave',hideTT);
    svg.appendChild(r);});
  // line helper
  function line(arr,color){let d='';arr.forEach((v,i)=>{const x=mL+bw*i+bw/2;const y=sc(v);
    d+=(i?'L':'M')+x+' '+y+' ';});
    svg.appendChild(el('path',{d:d,fill:'none',stroke:color,'stroke-width':2,
      'stroke-linejoin':'round','stroke-linecap':'round'}));
    arr.forEach((v,i)=>{const x=mL+bw*i+bw/2;svg.appendChild(el('circle',
      {cx:x,cy:sc(v),r:3,fill:color,stroke:css('--surface'),'stroke-width':1.5}));});}
  line(D.income,SC[0]);
  line(D.spend,SC[7]);
  // x labels (every other if crowded)
  const step=n>12?2:1;
  D.labels.forEach((lb,i)=>{if(i%step)return;const x=mL+bw*i+bw/2;
    const t=el('text',{x:x,y:H-12,'text-anchor':'middle',class:''});
    t.setAttribute('fill',css('--muted'));t.setAttribute('font-size','11');
    t.textContent=lb;svg.appendChild(t);});
  document.getElementById('netChart').appendChild(svg);
})();

// ---- Stacked area (spending by category) ----
(function(){
  const W=1000,H=360,mL=54,mR=16,mT=16,mB=34;
  const iw=W-mL-mR, ih=H-mT-mB;
  const cats=D.topCats, n=D.stack.length;
  // totals per month for max
  const totals=D.stack.map(r=>cats.reduce((s,c)=>s+(r[c]||0),0));
  const top=Math.max(...totals)*1.08||1;
  const sc=v=>mT+ih*(1-v/top);
  const bw=iw/n;
  const svg=el('svg',{viewBox:`0 0 ${W} ${H}`,role:'img'});
  const g=el('g',{class:'axis'});
  for(let i=0;i<=4;i++){const v=top*i/4;const y=sc(v);
    g.appendChild(el('line',{x1:mL,y1:y,x2:W-mR,y2:y}));
    const t=el('text',{x:mL-8,y:y+3,'text-anchor':'end'});t.textContent=eur(v);g.appendChild(t);}
  svg.appendChild(g);
  // stacked bars per month (clearer than area for discrete months)
  D.stack.forEach((r,i)=>{let acc=0;const x=mL+bw*i+bw*0.15;const w=bw*0.7;
    cats.forEach((c,ci)=>{const val=r[c]||0;if(val<=0)return;
      const y1=sc(acc+val),y0=sc(acc);acc+=val;
      const seg=el('rect',{x:x,y:y1,width:w,height:Math.max(0,y0-y1),
        fill:ci===cats.length-1&&c==='OTHER'?css('--s9'):SC[ci%9]});
      // 2px surface gap between segments
      seg.setAttribute('stroke',css('--surface'));seg.setAttribute('stroke-width','1');
      seg.addEventListener('mousemove',e=>showTT(
        `<b>${c}</b> · ${D.labels[i]}<br>${eur(val)}`,e.clientX,e.clientY));
      seg.addEventListener('mouseleave',hideTT);
      svg.appendChild(seg);});});
  const step=n>12?2:1;
  D.labels.forEach((lb,i)=>{if(i%step)return;const x=mL+bw*i+bw/2;
    const t=el('text',{x:x,y:H-12,'text-anchor':'middle'});
    t.setAttribute('fill',css('--muted'));t.setAttribute('font-size','11');
    t.textContent=lb;svg.appendChild(t);});
  document.getElementById('stackChart').appendChild(svg);
  // legend
  const lg=document.getElementById('stackLegend');
  cats.forEach((c,ci)=>{const s=document.createElement('span');
    const col=(c==='OTHER')?css('--s9'):SC[ci%9];
    s.innerHTML=`<i style="background:${col}"></i>${c}`;lg.appendChild(s);});
})();
</script>
</body>
</html>"""
