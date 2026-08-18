/**
 * CARRIER PRIORITY — Full-Stack Load Board Platform
 * =============================================
 * Complete production application for owner-operators and fleets.
 * This file is the full React frontend. See /server for backend.
 *
 * Tech Stack:
 *   Frontend : React + Vite, TailwindCSS (utility classes via inline styles)
 *   Backend  : Node.js / Express  (see server/index.js)
 *   Database : PostgreSQL via Drizzle ORM  (see server/db/)
 *   Auth     : JWT + refresh tokens  (see server/middleware/auth.js)
 *   Storage  : AWS S3 presigned URLs  (see server/services/storage.js)
 *   ELD      : Samsara / KeepTruckin webhooks  (see server/services/eld.js)
 *   Payments : Stripe ACH + Dwolla  (see server/services/payments.js)
 *   SMS/Push : Twilio + Expo Push  (see server/services/notify.js)
 *   Maps     : Mapbox GL  (see server/services/geo.js)
 *   FMCSA    : SAFER API verification  (see server/services/fmcsa.js)
 */

import { useState, useEffect, useRef, useCallback } from "react";

// ─── DESIGN SYSTEM ───────────────────────────────────────────────
const T = {
  // Backgrounds
  bg:       "#0f0e0d",
  surface:  "#1a1916",
  card:     "#201e1b",
  raised:   "#272420",
  border:   "#333028",
  borderHi: "#4a4538",
  // Text
  text:     "#f0ede6",
  muted:    "#9a9485",
  faint:    "#5a5548",
  // Accent — warm gold for the road
  gold:     "#e8a830",
  goldDim:  "#c48a20",
  goldBg:   "#2a2210",
  goldText: "#f5c660",
  // Status
  green:    "#2ecc71",
  greenBg:  "#0d2e1a",
  greenText:"#5de89a",
  red:      "#e74c3c",
  redBg:    "#2e0d0d",
  redText:  "#f07070",
  blue:     "#3498db",
  blueBg:   "#0d1e2e",
  blueText: "#70b8f0",
  amber:    "#f39c12",
  amberBg:  "#2e1e0d",
  amberText:"#f0c070",
  purple:   "#9b59b6",
  purpleBg: "#1e0d2e",
  purpleText:"#c070e8",
};

const css = (obj) => Object.entries(obj).map(([k,v])=>`${k.replace(/[A-Z]/g,m=>'-'+m.toLowerCase())}:${v}`).join(';');

// ─── SEED / MOCK DATA ─────────────────────────────────────────────
const ME = { id:"carrier-001", name:"Stewart Trucking LLC", mc:"MC-847291", dot:"DOT-3841029", role:"owner", plan:"fleet", truckCount:3, since:"2021" };

// ─── MARKET RATE BENCHMARKS (current market rates) ───────────────
// Dry Van:   $2.30 – $2.68 RPM  |  Reefer:    $2.79 – $3.12 RPM
// Flatbed:   $2.59 – $3.46 RPM  |  Cargo Van: $1.00 – $1.50 RPM
// Cost basis: $3.85/gal fuel · 6.5 mpg · $0.45/mi ops · $0.12/mi maint ≈ $2.16/loaded mile

const LOADS = [
  // Dry Van · 587 mi · $2.54/mi (above midpoint, grade-A shipper, clean lane)
  { id:"RL-4412", origin:"Columbus, OH", dest:"Atlanta, GA", originCoords:[39.96,-82.99], destCoords:[33.74,-84.38], miles:587, rate:1491, rpm:2.54, equipment:"Dry Van", weight:42000, pickup:"Today 06:00", drop:"Tomorrow 14:00", status:"in_transit", score:78, risk:"GOOD", net:224, deadhead:34, shipperScore:"A", shipper:"Acme Freight Inc", shipperMC:"MC-229310", verified:true, lane:"GOOD", flags:[], detention:"2hr free · $75/hr", driverId:"D-01", postedAt:"2h ago", commodity:"Auto Parts" },
  // Reefer · 921 mi · $2.92/mi (solid mid-market reefer, long haul South)
  { id:"RL-4413", origin:"Chicago, IL", dest:"Dallas, TX", originCoords:[41.87,-87.62], destCoords:[32.77,-96.79], miles:921, rate:2689, rpm:2.92, equipment:"Reefer", weight:38000, pickup:"Today 10:00", drop:"Tomorrow 22:00", status:"posted", score:82, risk:"GOOD", net:698, deadhead:67, shipperScore:"B", shipper:"Global Cold Chain", shipperMC:"MC-441820", verified:true, lane:"GOOD", flags:[], detention:"1hr free · $65/hr", driverId:null, postedAt:"45m ago", commodity:"Frozen Food" },
  // Flatbed · 1,098 mi · $2.78/mi (low end flatbed, high deadhead + unverified shipper)
  { id:"RL-4414", origin:"Memphis, TN", dest:"Miami, FL", originCoords:[35.14,-90.04], destCoords:[25.77,-80.19], miles:1098, rate:3052, rpm:2.78, equipment:"Flatbed", weight:44500, pickup:"Tomorrow 08:00", drop:"Dec 18 16:00", status:"posted", score:48, risk:"OK", net:683, deadhead:112, shipperScore:"C", shipper:"MidSouth Logistics", shipperMC:"MC-558841", verified:false, lane:"RISKY", flags:["High deadhead","Reload risk","Unverified shipper"], detention:"2hr free · $80/hr", driverId:null, postedAt:"3h ago", commodity:"Steel Coils" },
  // Dry Van · 432 mi · $2.61/mi (mid-market, short haul, verified A shipper)
  { id:"RL-4415", origin:"Louisville, KY", dest:"Charlotte, NC", originCoords:[38.25,-85.75], destCoords:[35.22,-80.84], miles:432, rate:1127, rpm:2.61, equipment:"Dry Van", weight:39000, pickup:"Today 14:00", drop:"Tomorrow 08:00", status:"booked", score:72, risk:"GOOD", net:194, deadhead:28, shipperScore:"A", shipper:"Acme Freight Inc", shipperMC:"MC-229310", verified:true, lane:"GOOD", flags:[], detention:"2hr free · $70/hr", driverId:"D-02", postedAt:"1h ago", commodity:"Consumer Goods" },
  // Reefer · 761 mi · $3.08/mi (upper-mid reefer, Northeast lane premium)
  { id:"RL-4416", origin:"Nashville, TN", dest:"Philadelphia, PA", originCoords:[36.16,-86.78], destCoords:[39.95,-75.16], miles:761, rate:2344, rpm:3.08, equipment:"Reefer", weight:36000, pickup:"Yesterday 12:00", drop:"Today 18:00", status:"delivered", score:85, risk:"GOOD", net:694, deadhead:52, shipperScore:"B", shipper:"Global Cold Chain", shipperMC:"MC-441820", verified:true, lane:"GOOD", flags:[], detention:"2hr free · $75/hr", driverId:"D-01", postedAt:"2d ago", commodity:"Dairy Products" },
  // Dry Van · 943 mi · $2.58/mi (mid-market long haul to Boston)
  { id:"RL-4417", origin:"Indianapolis, IN", dest:"Boston, MA", originCoords:[39.76,-86.15], destCoords:[42.36,-71.05], miles:943, rate:2433, rpm:2.58, equipment:"Dry Van", weight:40000, pickup:"Tomorrow 07:00", drop:"Dec 19 15:00", status:"posted", score:74, risk:"GOOD", net:396, deadhead:41, shipperScore:"A", shipper:"NorthEast Freight Co", shipperMC:"MC-774412", verified:true, lane:"GOOD", flags:[], detention:"1hr free · $60/hr", driverId:null, postedAt:"20m ago", commodity:"Electronics" },
  // Dry Van · 1,598 mi · $2.33/mi (floor of dry van range, dead-end lane, unverified)
  { id:"RL-4418", origin:"Kansas City, MO", dest:"Los Angeles, CA", originCoords:[39.09,-94.57], destCoords:[34.05,-118.24], miles:1598, rate:3723, rpm:2.33, equipment:"Dry Van", weight:41000, pickup:"Tomorrow 06:00", drop:"Dec 20 20:00", status:"posted", score:31, risk:"RISKY", net:-32, deadhead:145, shipperScore:"D", shipper:"Midwest Haulers LLC", shipperMC:"MC-882201", verified:false, lane:"RISKY", flags:["Below target RPM","High deadhead","Reload risk","Unverified shipper"], detention:"None", driverId:null, postedAt:"5h ago", commodity:"General Freight" },
  // Cargo Van · 218 mi · $1.28/mi (mid cargo van range, same-day medical run)
  { id:"RL-4419", origin:"Columbus, OH", dest:"Pittsburgh, PA", originCoords:[39.96,-82.99], destCoords:[40.44,-79.99], miles:218, rate:279, rpm:1.28, equipment:"Cargo Van", weight:2800, pickup:"Today 11:00", drop:"Today 17:00", status:"posted", score:55, risk:"OK", net:62, deadhead:18, shipperScore:"B", shipper:"Acme Freight Inc", shipperMC:"MC-229310", verified:true, lane:"GOOD", flags:[], detention:"1hr free · $35/hr", driverId:null, postedAt:"30m ago", commodity:"Medical Supplies" },
];

const DRIVERS = [
  { id:"D-01", name:"Marcus Webb", initials:"MW", phone:"(614) 555-0182", email:"m.webb@stewarttrucking.com", cdl:"OH-CDL-448821", cdlExp:"2026-03-15", medCard:"2025-01-20", drugTest:"2024-09-10", mvr:"2024-01-01", status:"driving", currentLoad:"RL-4412", truck:"TRK-07", equipment:"Dry Van", miles:184200, onTime:97, rating:4.9, accidents:0, violations:0, homeBase:"Columbus, OH", hos:{ drive:7.33, onDuty:10, cycle:29.4 }, eldConnected:true },
  { id:"D-02", name:"Rosa Delgado", initials:"RD", phone:"(614) 555-0247", email:"r.delgado@stewarttrucking.com", cdl:"OH-CDL-331104", cdlExp:"2025-09-30", medCard:"2025-06-15", drugTest:"2024-06-01", mvr:"2024-01-01", status:"available", currentLoad:"RL-4415", truck:"TRK-12", equipment:"Dry Van", miles:98400, onTime:94, rating:4.7, accidents:0, violations:1, homeBase:"Columbus, OH", hos:{ drive:0, onDuty:0, cycle:14.2 }, eldConnected:true },
  { id:"D-03", name:"James Okafor", initials:"JO", phone:"(614) 555-0391", email:"j.okafor@stewarttrucking.com", cdl:"OH-CDL-229876", cdlExp:"2026-07-22", medCard:"2025-08-10", drugTest:"2024-03-15", mvr:"2024-01-01", status:"off_duty", currentLoad:null, truck:"TRK-03", equipment:"Reefer", miles:224800, onTime:98, rating:4.9, accidents:0, violations:0, homeBase:"Dayton, OH", hos:{ drive:0, onDuty:0, cycle:8.1 }, eldConnected:false },
];

const TRUCKS = [
  { id:"TRK-07", year:2021, make:"Kenworth", model:"T680", vin:"1XKWDB9X1MJ448821", plate:"OH-812-JTK", odometer:184200, status:"in_service", driverId:"D-01", equipment:"Dry Van", trailer:"TR-221", lastPM:"Oct 15 2024", nextPM:185000, tires:"Oct 2024", registration:"Dec 31 2025", annualInspection:"Jan 2025" },
  { id:"TRK-12", year:2022, make:"Peterbilt", model:"579", vin:"1XPWD49X1ND331104", plate:"OH-447-RBM", odometer:98400, status:"in_service", driverId:"D-02", equipment:"Dry Van", trailer:"TR-308", lastPM:"Nov 01 2024", nextPM:100000, tires:"Nov 2024", registration:"Dec 31 2025", annualInspection:"Mar 2025" },
  { id:"TRK-03", year:2020, make:"Freightliner", model:"Cascadia", vin:"3AKJHHDR5LSLR9876", plate:"OH-229-XDF", odometer:224800, status:"available", driverId:"D-03", equipment:"Reefer", trailer:"TR-109", lastPM:"Sep 20 2024", nextPM:226000, tires:"Sep 2024", registration:"Dec 31 2025", annualInspection:"Jul 2025" },
];

// Invoices updated to reflect real market rates
const INVOICES = [
  { id:"INV-2041", loadId:"RL-4416", shipper:"Global Cold Chain", amount:2344, status:"paid", invoiced:"Dec 13", due:"Dec 28", paid:"Dec 20", avgPayDays:15, quickPayFee:70, factorAvail:false },
  { id:"INV-2040", loadId:"RL-4415", shipper:"Acme Freight Inc", amount:1127, status:"approved", invoiced:"Dec 14", due:"Dec 29", paid:null, avgPayDays:15, quickPayFee:34, factorAvail:true },
  { id:"INV-2039", loadId:"RL-4412", shipper:"Acme Freight Inc", amount:1491, status:"submitted", invoiced:"Dec 15", due:"Dec 30", paid:null, avgPayDays:15, quickPayFee:45, factorAvail:true },
  { id:"INV-2038", loadId:"RL-4413", shipper:"Global Cold Chain", amount:2689, status:"draft", invoiced:null, due:null, paid:null, avgPayDays:22, quickPayFee:81, factorAvail:false },
];

const DOCUMENTS = [
  { id:"DOC-001", loadId:"RL-4412", type:"Rate Confirmation", status:"signed", uploaded:"Dec 14 09:12", uploader:"Acme Freight", size:"284 KB", esigned:true },
  { id:"DOC-002", loadId:"RL-4412", type:"Bill of Lading", status:"approved", uploaded:"Dec 14 11:45", uploader:"Marcus Webb", size:"192 KB", esigned:false },
  { id:"DOC-003", loadId:"RL-4412", type:"Proof of Delivery", status:"pending", uploaded:null, uploader:null, size:null, esigned:false },
  { id:"DOC-004", loadId:"RL-4415", type:"Rate Confirmation", status:"signed", uploaded:"Dec 13 15:30", uploader:"Acme Freight", size:"310 KB", esigned:true },
  { id:"DOC-005", loadId:"RL-4415", type:"Bill of Lading", status:"pending", uploaded:null, uploader:null, size:null, esigned:false },
  { id:"DOC-006", loadId:"RL-4416", type:"Rate Confirmation", status:"signed", uploaded:"Dec 12 08:00", uploader:"Global Cold Chain", size:"276 KB", esigned:true },
  { id:"DOC-007", loadId:"RL-4416", type:"Bill of Lading", status:"approved", uploaded:"Dec 12 14:20", uploader:"Marcus Webb", size:"201 KB", esigned:false },
  { id:"DOC-008", loadId:"RL-4416", type:"Proof of Delivery", status:"approved", uploaded:"Dec 13 17:55", uploader:"Marcus Webb", size:"448 KB", esigned:false },
];

const COMPLIANCE_ITEMS = [
  { id:"C-01", category:"Authority", name:"MC Operating Authority", number:"MC-847291", status:"active", expires:null, issuer:"FMCSA", autoRenew:false },
  { id:"C-02", category:"Authority", name:"DOT Number", number:"DOT-3841029", status:"active", expires:null, issuer:"FMCSA", autoRenew:false },
  { id:"C-03", category:"Insurance", name:"Cargo Insurance", number:"PCM-8847122", status:"active", expires:"2025-02-28", issuer:"Progressive Commercial", autoRenew:true, limit:"$100,000" },
  { id:"C-04", category:"Insurance", name:"Liability Insurance ($1M)", number:"GWC-441882", status:"expiring", expires:"2025-01-15", issuer:"Great West Casualty", autoRenew:false, limit:"$1,000,000" },
  { id:"C-05", category:"Insurance", name:"Physical Damage", number:"GWC-441883", status:"active", expires:"2025-06-30", issuer:"Great West Casualty", autoRenew:false, limit:"ACV" },
  { id:"C-06", category:"Filing", name:"BOC-3 Process Agent", number:"BOC3-7741", status:"active", expires:null, issuer:"FMCSA", autoRenew:false },
  { id:"C-07", category:"Tax", name:"IRP Registration", number:"IRP-OH-22841", status:"expiring", expires:"2024-12-31", issuer:"Ohio BMV", autoRenew:false },
  { id:"C-08", category:"Tax", name:"IFTA License", number:"IFTA-OH-99123", status:"expiring", expires:"2024-12-31", issuer:"Ohio Dept Revenue", autoRenew:false },
  { id:"C-09", category:"Safety", name:"FMCSA Safety Rating", number:"DOT-3841029", status:"active", expires:null, issuer:"FMCSA", autoRenew:false, rating:"Satisfactory" },
  { id:"C-10", category:"Drug", name:"Drug & Alcohol Consortium", number:"MCP-44281", status:"active", expires:"2025-12-31", issuer:"Consortium Manager", autoRenew:true },
];

const TRACKING_EVENTS = {
  "RL-4412":[
    { id:1, time:"06:14", event:"Load dispatched — Marcus Webb (TRK-07) assigned", type:"dispatch", lat:39.96, lng:-82.99 },
    { id:2, time:"07:02", event:"Picked up at shipper — 42,100 lbs loaded, BOL signed", type:"pickup", lat:39.94, lng:-83.01 },
    { id:3, time:"09:45", event:"ELD check-in — I-71 South near Lexington, KY · 68 mph", type:"checkin", lat:38.04, lng:-84.49 },
    { id:4, time:"11:28", event:"Fuel stop — Pilot Travel Center, 87 gal @ $3.79 = $329.73", type:"fuel", lat:37.10, lng:-84.10 },
    { id:5, time:"14:00", event:"ELD check-in — Crossing into Tennessee on I-75", type:"checkin", lat:36.60, lng:-83.75 },
    { id:6, time:"Now",   event:"In transit — Est. arrival Tomorrow 14:00 · 284 mi remaining", type:"active", lat:35.90, lng:-83.92 },
  ],
  "RL-4415":[
    { id:1, time:"14:05", event:"Load dispatched — Rosa Delgado (TRK-12) assigned", type:"dispatch" },
    { id:2, time:"14:52", event:"En route to pickup — 18 mi to shipper", type:"checkin" },
  ],
};

const MESSAGES = {
  "RL-4412":[
    { from:"Acme Freight", time:"08:30", text:"Hi — any update on the pickup? We have a receiving window until 3pm at destination.", mine:false },
    { from:"Swift Haul", time:"08:47", text:"Confirmed pickup at 07:02. 42,100 lbs loaded, BOL #8812 signed. On schedule for tomorrow 14:00.", mine:true },
    { from:"Acme Freight", time:"09:05", text:"Perfect, thank you. Please send POD immediately upon delivery.", mine:false },
    { from:"Swift Haul", time:"09:07", text:"Will do — driver has the delivery instructions.", mine:true },
  ],
  "RL-4415":[
    { from:"Acme Freight", time:"13:00", text:"Rate confirmation signed and sent. Please confirm driver details.", mine:false },
    { from:"Swift Haul", time:"13:18", text:"Confirmed. Driver: Rosa Delgado, TRK-12, (614) 555-0247. ETA to pickup 14:45.", mine:true },
  ],
};

const SHIPPERS = [
  { id:"SH-001", name:"Acme Freight Inc", mc:"MC-229310", dot:"DOT-2291031", grade:"A", verified:true, avgPayDays:15, onTime:96, loads:24, totalPaid:58240, insurance:"Active", since:"2022-03-01", contact:"dispatch@acmefreight.com", phone:"(312) 555-0100" },
  { id:"SH-002", name:"Global Cold Chain", mc:"MC-441820", dot:"DOT-4418201", grade:"B", verified:true, avgPayDays:22, onTime:88, loads:12, totalPaid:34800, insurance:"Active", since:"2023-01-15", contact:"loads@globalcold.com", phone:"(312) 555-0200" },
  { id:"SH-003", name:"NorthEast Freight Co", mc:"MC-774412", dot:"DOT-7744120", grade:"A", verified:true, avgPayDays:18, onTime:93, loads:8, totalPaid:28900, insurance:"Active", since:"2023-06-01", contact:"ops@nefco.com", phone:"(617) 555-0300" },
  { id:"SH-004", name:"MidSouth Logistics", mc:"MC-558841", dot:"DOT-5588410", grade:"C", verified:false, avgPayDays:35, onTime:72, loads:3, totalPaid:8100, insurance:"Pending verification", since:"2024-11-01", contact:"info@midsouth.com", phone:"(901) 555-0400" },
];

const MAINTENANCE = [
  { id:"M-001", truckId:"TRK-07", type:"Oil Change", date:"Oct 15 2024", odometer:184000, cost:380, shop:"Columbus Truck Service", next:"185,000 mi or Apr 2025", status:"done" },
  { id:"M-002", truckId:"TRK-07", type:"Annual DOT Inspection", date:null, odometer:null, cost:null, shop:null, next:"Due Jan 2025", status:"upcoming" },
  { id:"M-003", truckId:"TRK-12", type:"PM Service", date:"Nov 01 2024", odometer:98000, cost:520, shop:"Peterbilt Columbus", next:"100,000 mi", status:"done" },
  { id:"M-004", truckId:"TRK-12", type:"Annual DOT Inspection", date:"Mar 15 2024", odometer:94200, cost:280, shop:"Ohio State Patrol", next:"Mar 2025", status:"done" },
  { id:"M-005", truckId:"TRK-03", type:"Reefer Unit PM", date:"Sep 20 2024", odometer:224000, cost:890, shop:"Carrier Transicold", next:"226,000 mi", status:"done" },
];

// ─── UTILITY COMPONENTS ───────────────────────────────────────────
function Pill({ label, color, bg, small }) {
  return (
    <span style={{ display:"inline-block", padding:small?"2px 8px":"3px 10px", borderRadius:99, fontSize:small?10:11, fontWeight:700, letterSpacing:"0.04em", color, background:bg }}>
      {label}
    </span>
  );
}

function Row({ label, value, color, borderless }) {
  return (
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:borderless?`none`:`0.5px solid ${T.border}`, fontSize:13 }}>
      <span style={{ color:T.muted }}>{label}</span>
      <span style={{ fontWeight:600, color:color||T.text }}>{value}</span>
    </div>
  );
}

function Card({ children, style={}, accent }) {
  return (
    <div style={{ background:T.card, border:`0.5px solid ${accent||T.border}`, borderRadius:12, overflow:"hidden", ...style }}>
      {children}
    </div>
  );
}

function CardHeader({ title, sub, right, accent }) {
  return (
    <div style={{ padding:"12px 18px", borderBottom:`0.5px solid ${T.border}`, background:accent||T.raised, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
      <div>
        <div style={{ fontSize:14, fontWeight:700, color:T.text }}>{title}</div>
        {sub&&<div style={{ fontSize:11, color:T.muted, marginTop:2 }}>{sub}</div>}
      </div>
      {right&&<div>{right}</div>}
    </div>
  );
}

function Btn({ children, variant="primary", onClick, small, disabled, fullWidth, style={} }) {
  const base = { display:"inline-flex", alignItems:"center", gap:6, padding:small?"5px 12px":"8px 16px", borderRadius:7, fontSize:small?11:13, fontWeight:700, cursor:disabled?"not-allowed":"pointer", border:"none", opacity:disabled?0.5:1, transition:"opacity 0.15s", width:fullWidth?"100%":"auto", justifyContent:"center", ...style };
  const variants = {
    primary:  { background:T.gold, color:"#000" },
    dark:     { background:T.surface, color:T.text, border:`0.5px solid ${T.border}` },
    ghost:    { background:"transparent", color:T.muted, border:`0.5px solid ${T.border}` },
    danger:   { background:T.redBg, color:T.redText, border:`0.5px solid ${T.red}44` },
    success:  { background:T.greenBg, color:T.greenText, border:`0.5px solid ${T.green}44` },
    purple:   { background:T.purpleBg, color:T.purpleText, border:`0.5px solid ${T.purple}44` },
  };
  return <button onClick={onClick} disabled={disabled} style={{ ...base, ...variants[variant] }}>{children}</button>;
}

function Input({ label, value, onChange, type="text", placeholder }) {
  return (
    <div style={{ marginBottom:12 }}>
      {label&&<label style={{ fontSize:11, color:T.muted, display:"block", marginBottom:5, textTransform:"uppercase", letterSpacing:"0.06em" }}>{label}</label>}
      <input type={type} value={value} onChange={onChange} placeholder={placeholder}
        style={{ width:"100%", padding:"9px 12px", fontSize:13, background:T.surface, border:`0.5px solid ${T.border}`, borderRadius:8, color:T.text, outline:"none", boxSizing:"border-box" }} />
    </div>
  );
}

function Toggle({ on, onChange }) {
  return (
    <button onClick={()=>onChange(!on)} style={{ width:40, height:22, borderRadius:99, border:"none", cursor:"pointer", background:on?T.gold:T.surface, position:"relative", transition:"background 0.2s" }}>
      <span style={{ position:"absolute", top:3, left:on?20:3, width:16, height:16, borderRadius:"50%", background:on?"#000":T.muted, transition:"left 0.2s" }} />
    </button>
  );
}

function Progress({ pct, color, height=6 }) {
  return (
    <div style={{ height, background:T.surface, borderRadius:99, overflow:"hidden" }}>
      <div style={{ height:"100%", width:`${Math.min(pct,100)}%`, background:color, borderRadius:99, transition:"width 0.4s" }} />
    </div>
  );
}

function Alert({ type, msg, onDismiss }) {
  const cfg = { warn:{ c:T.amberText, bg:T.amberBg, i:"ti-alert-triangle" }, error:{ c:T.redText, bg:T.redBg, i:"ti-alert-circle" }, info:{ c:T.blueText, bg:T.blueBg, i:"ti-info-circle" }, success:{ c:T.greenText, bg:T.greenBg, i:"ti-circle-check" } };
  const s = cfg[type];
  return (
    <div style={{ display:"flex", alignItems:"flex-start", gap:10, background:s.bg, border:`0.5px solid ${s.c}44`, borderRadius:9, padding:"10px 14px", marginBottom:10 }}>
      <i className={`ti ${s.i}`} style={{ fontSize:15, color:s.c, flexShrink:0, marginTop:1 }} aria-hidden />
      <span style={{ fontSize:12, color:s.c, flex:1, lineHeight:1.5 }}>{msg}</span>
      {onDismiss&&<button onClick={onDismiss} style={{ background:"none", border:"none", cursor:"pointer", color:s.c, fontSize:14, padding:0 }}>×</button>}
    </div>
  );
}

function SectionTitle({ title, sub, action }) {
  return (
    <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:18 }}>
      <div>
        <h2 style={{ margin:0, fontSize:18, fontWeight:800, color:T.text, fontFamily:"'Georgia',serif", letterSpacing:"-0.02em" }}>{title}</h2>
        {sub&&<p style={{ margin:"4px 0 0", fontSize:12, color:T.muted }}>{sub}</p>}
      </div>
      {action}
    </div>
  );
}

// ─── SCORE / STATUS HELPERS ───────────────────────────────────────
function scoreColor(s) { return s>=80?T.green:s>=60?T.amber:T.red; }
function scoreBg(s)    { return s>=80?T.greenBg:s>=60?T.amberBg:T.redBg; }
function scoreLabel(s) { return s>=80?"Top Pick":s>=60?"Solid":"Weak"; }

const LOAD_STATUS_CFG = {
  posted:     { label:"Available",   color:T.greenText,  bg:T.greenBg  },
  booked:     { label:"Booked",      color:T.blueText,   bg:T.blueBg   },
  in_transit: { label:"In Transit",  color:T.purpleText, bg:T.purpleBg },
  delivered:  { label:"Delivered",   color:T.muted,      bg:T.surface  },
};

const INV_STATUS_CFG = {
  draft:     { label:"Draft",     color:T.muted,      bg:T.surface  },
  submitted: { label:"Submitted", color:T.purpleText, bg:T.purpleBg },
  approved:  { label:"Approved",  color:T.blueText,   bg:T.blueBg   },
  paid:      { label:"Paid",      color:T.greenText,  bg:T.greenBg  },
};

const DRV_STATUS_CFG = {
  driving:   { label:"On Road",   color:T.purpleText, bg:T.purpleBg },
  available: { label:"Available", color:T.greenText,  bg:T.greenBg  },
  off_duty:  { label:"Off Duty",  color:T.muted,      bg:T.surface  },
};

// ─── AUTH SCREEN ──────────────────────────────────────────────────
function AuthScreen({ onLogin }) {
  const [mode, setMode] = useState("login");
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ email:"", password:"", name:"", mc:"", dot:"", plan:"solo" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function field(k) { return { value:form[k], onChange:e=>setForm({...form,[k]:e.target.value}) }; }

  async function submit() {
    setError(""); setLoading(true);
    await new Promise(r=>setTimeout(r,900));
    // In prod: POST /api/auth/login or /api/auth/register + JWT
    if (mode==="login") {
      if (!form.email||!form.password) { setError("Email and password required."); setLoading(false); return; }
      onLogin();
    } else {
      if (step===1) { if(!form.email||!form.password||!form.name){setError("All fields required.");setLoading(false);return;} setStep(2); setLoading(false); return; }
      if (step===2) { if(!form.mc){setError("MC number required for FMCSA verification.");setLoading(false);return;} setStep(3); setLoading(false); return; }
      if (step===3) { onLogin(); }
    }
    setLoading(false);
  }

  const PLANS = [
    { id:"solo", label:"Owner-Operator", price:"$49/mo", perks:["1 driver","Unlimited loads","Document storage","Invoice tracking","Compliance alerts"] },
    { id:"fleet", label:"Fleet (2–10)", price:"$149/mo", perks:["Up to 10 drivers","Fleet dashboard","ELD integration","Multi-truck tracking","Priority support"] },
    { id:"enterprise", label:"Enterprise", price:"Custom", perks:["Unlimited drivers","API access","Custom integrations","Dedicated account manager","SLA guarantee"] },
  ];

  return (
    <div style={{ minHeight:"100vh", background:T.bg, display:"flex" }}>
      {/* Left panel */}
      <div style={{ width:"45%", background:T.surface, borderRight:`0.5px solid ${T.border}`, display:"flex", flexDirection:"column", padding:"48px 52px", justifyContent:"center" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:48 }}>
          <div style={{ width:36, height:36, background:T.gold, borderRadius:9, display:"flex", alignItems:"center", justifyContent:"center" }}>
            <i className="ti ti-truck" style={{ fontSize:20, color:"#000" }} aria-hidden />
          </div>
          <div>
            <div style={{ fontSize:20, fontWeight:900, color:T.text, fontFamily:"Georgia,serif", letterSpacing:"-0.03em" }}>CARRIER PRIORITY</div>
            <div style={{ fontSize:10, color:T.gold, fontWeight:800, letterSpacing:"0.12em", textTransform:"uppercase" }}>Full-Stack Load Platform</div>
          </div>
        </div>
        <h1 style={{ fontSize:32, fontWeight:900, color:T.text, fontFamily:"Georgia,serif", lineHeight:1.2, margin:"0 0 16px", letterSpacing:"-0.03em" }}>
          The broker is<br /><span style={{ color:T.gold }}>no longer necessary.</span>
        </h1>
        <p style={{ color:T.muted, fontSize:15, lineHeight:1.7, margin:"0 0 36px" }}>
          CARRIER PRIORITY gives owner-operators and fleets every tool to find loads, manage documents, track payments, and stay compliant — without giving 15% to a middleman.
        </p>
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {["Profit-first load scoring","Digital rate confirmations & e-sign","Real-time ELD tracking","Automated invoice & Quick Pay","FMCSA compliance monitoring","Shipper verification & grading"].map(f=>(
            <div key={f} style={{ display:"flex", alignItems:"center", gap:10, fontSize:13, color:T.muted }}>
              <i className="ti ti-check" style={{ fontSize:14, color:T.gold }} aria-hidden /> {f}
            </div>
          ))}
        </div>
        <div style={{ marginTop:40, padding:"14px 18px", background:T.card, borderRadius:10, border:`0.5px solid ${T.border}` }}>
          <div style={{ fontSize:12, color:T.gold, fontWeight:700, marginBottom:4 }}>Built from the road up</div>
          <div style={{ fontSize:12, color:T.muted, lineHeight:1.6 }}>"Before CARRIER PRIORITY I was calling brokers all day just to find loads that paid $1.85/mile. Now I'm consistently finding dry van loads at $2.54–$2.61 and getting paid in 48 hours." — Marcus T., Owner-Operator, Columbus OH</div>
        </div>
      </div>

      {/* Right panel */}
      <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", padding:48 }}>
        <div style={{ width:"100%", maxWidth:460 }}>
          <div style={{ display:"flex", gap:4, marginBottom:28, background:T.surface, borderRadius:9, padding:4, border:`0.5px solid ${T.border}` }}>
            {["login","register"].map(m=>(
              <button key={m} onClick={()=>{ setMode(m); setStep(1); setError(""); }} style={{
                flex:1, padding:"8px", borderRadius:7, border:"none", cursor:"pointer", fontSize:13, fontWeight:700,
                background:mode===m?T.card:"transparent", color:mode===m?T.text:T.muted
              }}>{m==="login"?"Sign In":"Create Account"}</button>
            ))}
          </div>

          {error&&<Alert type="error" msg={error} onDismiss={()=>setError("")} />}

          {mode==="login" ? (
            <div>
              <Input label="Email" type="email" placeholder="dispatch@yourcompany.com" {...field("email")} />
              <Input label="Password" type="password" placeholder="••••••••" {...field("password")} />
              <div style={{ textAlign:"right", marginBottom:18 }}>
                <span style={{ fontSize:12, color:T.gold, cursor:"pointer" }}>Forgot password?</span>
              </div>
              <Btn variant="primary" onClick={submit} disabled={loading} fullWidth>
                {loading?<><i className="ti ti-loader" aria-hidden /> Signing in…</>:<><i className="ti ti-login" aria-hidden /> Sign In</>}
              </Btn>
              <div style={{ marginTop:16, textAlign:"center" }}>
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
                  <div style={{ flex:1, height:"0.5px", background:T.border }} />
                  <span style={{ fontSize:11, color:T.faint }}>or sign in with</span>
                  <div style={{ flex:1, height:"0.5px", background:T.border }} />
                </div>
                <div style={{ display:"flex", gap:8 }}>
                  {["Google","Apple","ELD Provider"].map(p=>(
                    <Btn key={p} variant="ghost" style={{ flex:1, fontSize:11 }}>
                      <i className={`ti ti-brand-${p.toLowerCase().replace(" ","-")}`} aria-hidden /> {p}
                    </Btn>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ display:"flex", gap:4, marginBottom:20 }}>
                {[1,2,3].map(s=>(
                  <div key={s} style={{ flex:1, height:3, borderRadius:99, background:step>=s?T.gold:T.border }} />
                ))}
              </div>
              <div style={{ fontSize:11, color:T.muted, marginBottom:16, textTransform:"uppercase", letterSpacing:"0.06em" }}>
                Step {step} of 3 — {["Account Details","FMCSA Verification","Select Plan"][step-1]}
              </div>

              {step===1&&<>
                <Input label="Company Name" placeholder="Stewart Trucking LLC" {...field("name")} />
                <Input label="Email" type="email" placeholder="owner@yourcompany.com" {...field("email")} />
                <Input label="Password" type="password" placeholder="Min. 8 characters" {...field("password")} />
              </>}

              {step===2&&<>
                <Alert type="info" msg="CARRIER PRIORITY verifies your MC authority and DOT number against FMCSA's SAFER database to protect shippers and maintain platform integrity." />
                <Input label="MC Number" placeholder="MC-847291" {...field("mc")} />
                <Input label="DOT Number (optional)" placeholder="DOT-3841029" {...field("dot")} />
                <div style={{ fontSize:11, color:T.muted, marginTop:-4, marginBottom:12 }}>
                  We'll verify your authority status, insurance on file, and safety rating. This takes 15–30 seconds.
                </div>
              </>}

              {step===3&&<>
                <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:20 }}>
                  {PLANS.map(p=>(
                    <div key={p.id} onClick={()=>setForm({...form,plan:p.id})} style={{
                      padding:"14px 16px", borderRadius:10, cursor:"pointer",
                      border:`${form.plan===p.id?"1.5px":"0.5px"} solid ${form.plan===p.id?T.gold:T.border}`,
                      background:form.plan===p.id?T.goldBg:T.surface
                    }}>
                      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                        <span style={{ fontSize:13, fontWeight:700, color:form.plan===p.id?T.goldText:T.text }}>{p.label}</span>
                        <span style={{ fontSize:13, fontWeight:700, color:T.gold }}>{p.price}</span>
                      </div>
                      <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
                        {p.perks.map(pk=><span key={pk} style={{ fontSize:10, color:T.muted }}>✓ {pk}</span>)}
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize:11, color:T.muted, marginBottom:16 }}>
                  14-day free trial, no credit card required. Cancel anytime.
                </div>
              </>}

              <Btn variant="primary" onClick={submit} disabled={loading} fullWidth>
                {loading?<><i className="ti ti-loader" aria-hidden /> {step===2?"Verifying with FMCSA…":"Processing…"}</>:
                  step<3?<>Continue <i className="ti ti-arrow-right" aria-hidden /></>:
                  <><i className="ti ti-rocket" aria-hidden /> Launch CARRIER PRIORITY</>}
              </Btn>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── LOAD BOARD ───────────────────────────────────────────────────
function LoadBoard() {
  const [search, setSearch] = useState("");
  const [equip, setEquip] = useState("All");
  const [sortBy, setSort] = useState("score");
  const [statusFilter, setStatus] = useState("posted");
  const [selected, setSelected] = useState(null);
  const [offerVal, setOffer] = useState("");
  const [offerSent, setOfferSent] = useState({});
  const [booked, setBooked] = useState({});
  const [signRequested, setSignRequested] = useState({});

  const filtered = LOADS.filter(l=>
    (statusFilter==="all"||l.status===statusFilter) &&
    (search===""||l.origin.toLowerCase().includes(search.toLowerCase())||l.dest.toLowerCase().includes(search.toLowerCase())||l.shipper.toLowerCase().includes(search.toLowerCase())) &&
    (equip==="All"||l.equipment===equip)
  ).sort((a,b)=> sortBy==="score"?b.score-a.score:sortBy==="rate"?b.rate-a.rate:b.rpm-a.rpm);

  const sel = selected?LOADS.find(l=>l.id===selected):null;

  function handleBook(id) { setBooked({...booked,[id]:true}); }
  function handleOffer(id) { if(offerVal){setOfferSent({...offerSent,[id]:true});setOffer("");} }
  function handleSign(id) { setSignRequested({...signRequested,[id]:true}); }

  const fuelCost = sel?Math.round(((sel.miles+sel.deadhead)/6.5)*3.85):0;
  const opCost   = sel?Math.round((sel.miles+sel.deadhead)*0.45):0;
  const maint    = sel?Math.round(sel.miles*0.12):0;

  return (
    <div style={{ display:"grid", gridTemplateColumns:"1fr 380px", gap:16 }}>
      <div>
        {/* Filter bar */}
        <Card style={{ padding:"12px 16px", marginBottom:14, borderRadius:10 }}>
          <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
            <div style={{ position:"relative", flex:1, minWidth:200 }}>
              <i className="ti ti-search" style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", fontSize:13, color:T.faint }} aria-hidden />
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Origin, destination, or shipper…"
                style={{ width:"100%", padding:"7px 10px 7px 30px", fontSize:12, background:T.surface, border:`0.5px solid ${T.border}`, borderRadius:7, color:T.text, outline:"none", boxSizing:"border-box" }} />
            </div>
            {["All","Dry Van","Reefer","Flatbed","Cargo Van"].map(e=>(
              <button key={e} onClick={()=>setEquip(e)} style={{ padding:"5px 11px", borderRadius:6, fontSize:11, fontWeight:600,
                border:`0.5px solid ${equip===e?T.gold:T.border}`, background:equip===e?T.goldBg:"transparent",
                color:equip===e?T.goldText:T.muted, cursor:"pointer" }}>{e}</button>
            ))}
            <select value={sortBy} onChange={e=>setSort(e.target.value)} style={{ padding:"6px 10px", fontSize:11, border:`0.5px solid ${T.border}`, borderRadius:7, background:T.surface, color:T.muted, cursor:"pointer" }}>
              <option value="score">Best Score</option>
              <option value="rate">Rate ↓</option>
              <option value="rpm">RPM ↓</option>
            </select>
            <select value={statusFilter} onChange={e=>setStatus(e.target.value)} style={{ padding:"6px 10px", fontSize:11, border:`0.5px solid ${T.border}`, borderRadius:7, background:T.surface, color:T.muted, cursor:"pointer" }}>
              <option value="posted">Available</option>
              <option value="booked">Booked</option>
              <option value="in_transit">In Transit</option>
              <option value="delivered">Delivered</option>
              <option value="all">All Loads</option>
            </select>
            <span style={{ fontSize:11, color:T.faint }}>{filtered.length} loads</span>
          </div>
        </Card>

        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {filtered.map(l=>{
            const isSel=selected===l.id;
            const sc=LOAD_STATUS_CFG[l.status];
            return (
              <div key={l.id} onClick={()=>setSelected(isSel?null:l.id)} style={{
                background:isSel?T.goldBg:T.card, border:`${isSel?"1.5px":"0.5px"} solid ${isSel?T.gold:T.border}`,
                borderRadius:12, padding:"14px 18px", cursor:"pointer"
              }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:10 }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                      <span style={{ fontSize:14, fontWeight:800, color:T.text, fontFamily:"Georgia,serif" }}>{l.origin}</span>
                      <i className="ti ti-arrow-right" style={{ fontSize:12, color:T.faint }} aria-hidden />
                      <span style={{ fontSize:14, fontWeight:800, color:T.text, fontFamily:"Georgia,serif" }}>{l.dest}</span>
                    </div>
                    <div style={{ fontSize:11, color:T.muted, marginBottom:8 }}>
                      {l.equipment} · {l.miles.toLocaleString()} mi · {(l.weight/1000).toFixed(0)}k lbs · {l.commodity}
                      {l.verified?<span style={{ color:T.greenText }}> · ✓ Verified Shipper</span>:<span style={{ color:T.amberText }}> · ⚠ Unverified</span>}
                    </div>
                    <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
                      <Pill label={`${scoreLabel(l.score)} · ${l.score}`} color={scoreColor(l.score)} bg={scoreBg(l.score)} small />
                      <Pill label={sc.label} color={sc.color} bg={sc.bg} small />
                      {l.lane==="RISKY"&&<Pill label="Lane Risk" color={T.amberText} bg={T.amberBg} small />}
                      <Pill label={`Grade ${l.shipperScore}`} color={T.muted} bg={T.surface} small />
                      <span style={{ fontSize:10, color:T.faint }}>{l.postedAt}</span>
                    </div>
                    {l.flags.length>0&&<div style={{ marginTop:7, display:"flex", gap:4, flexWrap:"wrap" }}>
                      {l.flags.map(f=><span key={f} style={{ padding:"2px 7px", borderRadius:4, fontSize:10, fontWeight:600, color:T.redText, background:T.redBg }}>⚠ {f}</span>)}
                    </div>}
                  </div>
                  <div style={{ textAlign:"right", flexShrink:0 }}>
                    <div style={{ fontSize:22, fontWeight:900, color:T.text, fontFamily:"Georgia,serif", letterSpacing:"-0.03em" }}>${l.rate.toLocaleString()}</div>
                    <div style={{ fontSize:11, color:T.muted }}>${l.rpm.toFixed(2)}/mi</div>
                    <div style={{ fontSize:13, fontWeight:700, marginTop:2, color:l.net>0?T.greenText:T.redText }}>{l.net>0?"+":""}${l.net.toLocaleString()} net</div>
                  </div>
                </div>
                <div style={{ marginTop:10, paddingTop:10, borderTop:`0.5px solid ${T.border}`, display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8, textAlign:"center" }}>
                  {[{l:"$/mi",v:`$${l.rpm.toFixed(2)}`},{l:"Deadhead",v:`${l.deadhead}mi`},{l:"Pickup",v:l.pickup.split(" ").slice(0,2).join(" ")},{l:"Detention",v:l.detention.split("·")[0].trim()}].map(m=>(
                    <div key={m.l}><div style={{ fontSize:12, fontWeight:700, color:T.text }}>{m.v}</div><div style={{ fontSize:10, color:T.faint, marginTop:1 }}>{m.l}</div></div>
                  ))}
                </div>
                <div style={{ marginTop:8, fontSize:10, color:T.faint, fontStyle:"italic" }}>Ranked: profit/mi + shipper trust − deadhead − lane risk</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Detail panel */}
      <div>
        {!sel ? (
          <Card style={{ padding:40, textAlign:"center" }}>
            <i className="ti ti-truck" style={{ fontSize:48, color:T.faint, display:"block", marginBottom:14 }} aria-hidden />
            <p style={{ color:T.faint, fontSize:13, margin:0 }}>Select a load to view full details, profit analysis, and booking options</p>
          </Card>
        ) : (
          <Card>
            <CardHeader
              title={`${sel.origin} → ${sel.dest}`}
              sub={`${sel.id} · ${sel.shipper}`}
              accent={sel.score>=80?T.greenBg:sel.score>=60?T.amberBg:T.redBg}
              right={<Pill label={LOAD_STATUS_CFG[sel.status].label} color={LOAD_STATUS_CFG[sel.status].color} bg={LOAD_STATUS_CFG[sel.status].bg} small />}
            />
            <div style={{ padding:"16px 18px" }}>
              {/* Shipper verification */}
              <div style={{ marginBottom:14, padding:"10px 12px", borderRadius:8, background:sel.verified?T.greenBg:T.amberBg, border:`0.5px solid ${sel.verified?T.green:T.amber}44` }}>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <i className={`ti ti-${sel.verified?"shield-check":"shield-exclamation"}`} style={{ fontSize:16, color:sel.verified?T.greenText:T.amberText }} aria-hidden />
                  <div>
                    <div style={{ fontSize:12, fontWeight:700, color:sel.verified?T.greenText:T.amberText }}>{sel.verified?"FMCSA Verified Shipper":"Shipper Not Yet Verified"}</div>
                    <div style={{ fontSize:10, color:T.muted }}>MC: {sel.shipperMC} · Grade {sel.shipperScore}</div>
                  </div>
                </div>
              </div>

              {/* Core metrics */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:14 }}>
                {[
                  {l:"All-in Rate", v:`$${sel.rate.toLocaleString()}`, big:true},
                  {l:"Net Profit",  v:`${sel.net>0?"+":""}$${sel.net.toLocaleString()}`, big:true, c:sel.net>0?T.greenText:T.redText},
                  {l:"Miles",       v:`${sel.miles.toLocaleString()} mi`},
                  {l:"Rate/Mile",   v:`$${sel.rpm.toFixed(2)}`},
                  {l:"Weight",      v:`${(sel.weight/1000).toFixed(0)}k lbs`},
                  {l:"Deadhead",    v:`${sel.deadhead} mi`},
                ].map(m=>(
                  <div key={m.l} style={{ background:T.surface, borderRadius:8, padding:"10px 12px" }}>
                    <div style={{ fontSize:9, color:T.faint, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:3 }}>{m.l}</div>
                    <div style={{ fontSize:m.big?18:13, fontWeight:800, color:m.c||T.text, fontFamily:m.big?"Georgia,serif":"inherit" }}>{m.v}</div>
                  </div>
                ))}
              </div>

              {/* Cost breakdown */}
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:10, color:T.faint, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:8 }}>Cost Breakdown</div>
                {[{l:"Fuel",v:fuelCost,i:"ti-gas-station"},{l:"Operating",v:opCost,i:"ti-tool"},{l:"Maintenance",v:maint,i:"ti-settings"}].map(c=>(
                  <div key={c.l} style={{ display:"flex", justifyContent:"space-between", padding:"6px 0", borderBottom:`0.5px solid ${T.border}` }}>
                    <span style={{ fontSize:12, color:T.muted, display:"flex", alignItems:"center", gap:6 }}>
                      <i className={`ti ${c.i}`} style={{ fontSize:13 }} aria-hidden />{c.l}
                    </span>
                    <span style={{ fontSize:12, fontWeight:700, color:T.redText }}>−${c.v.toLocaleString()}</span>
                  </div>
                ))}
                <div style={{ display:"flex", justifyContent:"space-between", padding:"7px 0", fontSize:13, fontWeight:800 }}>
                  <span style={{ color:T.text }}>Net Profit</span>
                  <span style={{ color:sel.net>0?T.greenText:T.redText }}>{sel.net>0?"+":""}${sel.net.toLocaleString()}</span>
                </div>
              </div>

              {/* Schedule */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:14 }}>
                <div style={{ background:T.surface, borderRadius:8, padding:"8px 12px" }}>
                  <div style={{ fontSize:9, color:T.faint, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:3 }}>Pickup</div>
                  <div style={{ fontSize:12, fontWeight:700, color:T.text }}>{sel.pickup}</div>
                </div>
                <div style={{ background:T.surface, borderRadius:8, padding:"8px 12px" }}>
                  <div style={{ fontSize:9, color:T.faint, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:3 }}>Delivery</div>
                  <div style={{ fontSize:12, fontWeight:700, color:T.text }}>{sel.drop}</div>
                </div>
              </div>

              {sel.flags.length>0&&<Alert type="error" msg={`Risk flags: ${sel.flags.join(" · ")}`} />}

              {/* Actions */}
              {sel.status==="posted"&&(
                booked[sel.id] ? (
                  <Alert type="success" msg="Load booked! Rate confirmation sent for e-signature." />
                ) : offerSent[sel.id] ? (
                  <Alert type="success" msg="Offer submitted! You'll be notified when the shipper responds." />
                ) : (
                  <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
                    <Btn variant="primary" onClick={()=>handleBook(sel.id)} fullWidth>
                      <i className="ti ti-bolt" aria-hidden /> Book Now at ${sel.rate.toLocaleString()}
                    </Btn>
                    <div style={{ display:"flex", gap:7 }}>
                      <input type="number" value={offerVal} onChange={e=>setOffer(e.target.value)} placeholder={`Counter offer (listed: $${sel.rate.toLocaleString()})`}
                        style={{ flex:1, padding:"8px 12px", fontSize:12, background:T.surface, border:`0.5px solid ${T.border}`, borderRadius:7, color:T.text, outline:"none" }} />
                      <Btn variant="ghost" onClick={()=>handleOffer(sel.id)}>Submit</Btn>
                    </div>
                  </div>
                )
              )}
              {booked[sel.id]&&!signRequested[sel.id]&&(
                <Btn variant="success" onClick={()=>handleSign(sel.id)} fullWidth style={{ marginTop:7 }}>
                  <i className="ti ti-pen" aria-hidden /> Sign Rate Confirmation
                </Btn>
              )}
              {signRequested[sel.id]&&<Alert type="success" msg="Rate confirmation e-signed and sent to shipper. Load is confirmed." />}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

// ─── LOAD TRACKING ────────────────────────────────────────────────
function Tracking() {
  const [sel, setSel] = useState("RL-4412");
  const [msgs, setMsgs] = useState(MESSAGES["RL-4412"]||[]);
  const [msg, setMsg] = useState("");
  const active = LOADS.filter(l=>["in_transit","booked"].includes(l.status));
  const load = LOADS.find(l=>l.id===sel);
  const events = TRACKING_EVENTS[sel]||[];
  const driver = DRIVERS.find(d=>d.id===load?.driverId);

  function switchLoad(id) { setSel(id); setMsgs(MESSAGES[id]||[]); }
  function send() { if(!msg.trim())return; setMsgs([...msgs,{from:"Stewart Trucking",time:"Now",text:msg,mine:true}]); setMsg(""); }

  const EV_ICON = { dispatch:"ti-send", pickup:"ti-package", checkin:"ti-map-pin", fuel:"ti-gas-station", active:"ti-navigation", success:"ti-circle-check" };
  const EV_COLOR = { dispatch:T.blueText, pickup:T.greenText, checkin:T.purpleText, fuel:T.amberText, active:T.gold, success:T.greenText };

  return (
    <div>
      <SectionTitle title="Load Tracking" sub="Real-time GPS · ELD integration · shipper communication" />
      <div style={{ display:"flex", gap:8, marginBottom:18, flexWrap:"wrap" }}>
        {active.map(l=>(
          <button key={l.id} onClick={()=>switchLoad(l.id)} style={{
            padding:"7px 14px", borderRadius:7, fontSize:12, fontWeight:600, cursor:"pointer",
            border:`${sel===l.id?"1.5px":"0.5px"} solid ${sel===l.id?T.gold:T.border}`,
            background:sel===l.id?T.goldBg:T.surface, color:sel===l.id?T.goldText:T.muted
          }}>{l.id} · {l.origin.split(",")[0]}→{l.dest.split(",")[0]}</button>
        ))}
      </div>

      {load&&<div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <Card>
            <CardHeader title={`${load.id} — ${load.origin}`} sub={`→ ${load.dest} · ${load.equipment}`}
              right={<Pill label={LOAD_STATUS_CFG[load.status].label} color={LOAD_STATUS_CFG[load.status].color} bg={LOAD_STATUS_CFG[load.status].bg} small />} />
            <div style={{ padding:"14px 18px" }}>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginBottom:16 }}>
                {[{l:"Rate",v:`$${load.rate.toLocaleString()}`},{l:"ETA",v:load.drop},{l:"Miles Left",v:"284 mi"}].map(m=>(
                  <div key={m.l} style={{ background:T.surface, borderRadius:7, padding:"8px 10px" }}>
                    <div style={{ fontSize:9, color:T.faint, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:2 }}>{m.l}</div>
                    <div style={{ fontSize:12, fontWeight:700, color:T.text }}>{m.v}</div>
                  </div>
                ))}
              </div>

              {driver&&<div style={{ marginBottom:16, padding:"10px 14px", background:T.surface, borderRadius:9, display:"flex", alignItems:"center", gap:12 }}>
                <div style={{ width:36, height:36, borderRadius:"50%", background:T.purpleBg, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:800, color:T.purpleText }}>
                  {driver.initials}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:T.text }}>{driver.name}</div>
                  <div style={{ fontSize:11, color:T.muted }}>{driver.truck} · {driver.phone}</div>
                </div>
                <div>
                  <Pill label={DRV_STATUS_CFG[driver.status].label} color={DRV_STATUS_CFG[driver.status].color} bg={DRV_STATUS_CFG[driver.status].bg} small />
                  {driver.eldConnected&&<div style={{ fontSize:10, color:T.greenText, marginTop:3 }}>● ELD Live</div>}
                </div>
              </div>}

              <div style={{ fontSize:10, color:T.faint, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:12 }}>Timeline</div>
              {events.map((e,i)=>(
                <div key={e.id} style={{ display:"flex", gap:10, paddingBottom:12 }}>
                  <div style={{ flexShrink:0, display:"flex", flexDirection:"column", alignItems:"center" }}>
                    <div style={{ width:28, height:28, borderRadius:"50%", background:EV_COLOR[e.type]+"22", border:`1.5px solid ${EV_COLOR[e.type]}`, display:"flex", alignItems:"center", justifyContent:"center" }}>
                      <i className={`ti ${EV_ICON[e.type]||"ti-info-circle"}`} style={{ fontSize:12, color:EV_COLOR[e.type] }} aria-hidden />
                    </div>
                    {i<events.length-1&&<div style={{ width:1.5, flex:1, background:T.border, marginTop:4, minHeight:16 }} />}
                  </div>
                  <div style={{ paddingTop:4 }}>
                    <div style={{ fontSize:12, color:e.type==="active"?T.gold:T.text, fontWeight:e.type==="active"?700:400 }}>{e.event}</div>
                    <div style={{ fontSize:10, color:T.faint, marginTop:2 }}>{e.time}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* HOS for active driver */}
          {driver&&<Card>
            <CardHeader title="Hours of Service" sub={`${driver.name} · ELD sync ${driver.eldConnected?"live":"manual"}`} />
            <div style={{ padding:"14px 18px" }}>
              {[
                {l:"Drive time",pct:(driver.hos.drive/11)*100,v:`${driver.hos.drive.toFixed(1)}h / 11h limit`,c:driver.hos.drive>9?T.red:T.amber},
                {l:"On-duty",pct:(driver.hos.onDuty/14)*100,v:`${driver.hos.onDuty}h / 14h limit`,c:driver.hos.onDuty>12?T.red:T.green},
                {l:"Cycle (70hr/8-day)",pct:(driver.hos.cycle/70)*100,v:`${driver.hos.cycle}h / 70h`,c:T.green},
              ].map(h=>(
                <div key={h.l} style={{ marginBottom:12 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:5 }}>
                    <span style={{ color:T.muted }}>{h.l}</span>
                    <span style={{ fontWeight:700, color:h.c }}>{h.v}</span>
                  </div>
                  <Progress pct={h.pct} color={h.c} />
                </div>
              ))}
            </div>
          </Card>}
        </div>

        {/* Chat */}
        <Card style={{ display:"flex", flexDirection:"column" }}>
          <CardHeader title={`Shipper Chat — ${load.shipper}`}
            right={<span style={{ fontSize:10, color:T.greenText }}>● Connected</span>} />
          <div style={{ flex:1, padding:"14px 18px", display:"flex", flexDirection:"column", gap:10, minHeight:320 }}>
            {msgs.map((m,i)=>(
              <div key={i} style={{ display:"flex", justifyContent:m.mine?"flex-end":"flex-start" }}>
                <div style={{ maxWidth:"82%", padding:"9px 13px", borderRadius:10, background:m.mine?T.gold:T.surface, color:m.mine?"#000":T.text }}>
                  {!m.mine&&<div style={{ fontSize:10, fontWeight:700, color:T.muted, marginBottom:4 }}>{m.from}</div>}
                  <div style={{ fontSize:13 }}>{m.text}</div>
                  <div style={{ fontSize:10, opacity:0.6, marginTop:4, textAlign:"right" }}>{m.time}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ padding:"12px 18px", borderTop:`0.5px solid ${T.border}`, display:"flex", gap:7 }}>
            <input value={msg} onChange={e=>setMsg(e.target.value)} onKeyDown={e=>e.key==="Enter"&&send()} placeholder="Type a message…"
              style={{ flex:1, padding:"8px 12px", fontSize:12, background:T.surface, border:`0.5px solid ${T.border}`, borderRadius:7, color:T.text, outline:"none" }} />
            <Btn variant="primary" onClick={send} small><i className="ti ti-send" aria-hidden /></Btn>
          </div>
        </Card>
      </div>}
    </div>
  );
}

// ─── DOCUMENT HUB ────────────────────────────────────────────────
function Documents() {
  const [docs, setDocs] = useState(DOCUMENTS);
  const [uploading, setUploading] = useState(null);
  const [signed, setSigned] = useState({});
  const [flash, setFlash] = useState(null);

  const LOAD_REQS = { "RL-4412":["Rate Confirmation","Bill of Lading","Proof of Delivery"], "RL-4415":["Rate Confirmation","Bill of Lading"], "RL-4416":["Rate Confirmation","Bill of Lading","Proof of Delivery"] };
  const activeLoads = LOADS.filter(l=>["in_transit","booked","delivered"].includes(l.status));

  function getDoc(loadId, type) { return docs.find(d=>d.loadId===loadId&&d.type===type); }
  function getStatus(loadId, type) { const d=getDoc(loadId,type); return d?d.status:"missing"; }

  function upload(loadId, type) {
    setUploading(`${loadId}-${type}`);
    setTimeout(()=>{
      setDocs(prev=>[...prev.filter(d=>!(d.loadId===loadId&&d.type===type)),
        { id:`DOC-${Date.now()}`, loadId, type, status:"approved", uploaded:"Now", uploader:"You", size:"312 KB", esigned:false }]);
      setUploading(null); setFlash(`${type} uploaded for ${loadId}`);
      setTimeout(()=>setFlash(null),3000);
    },1200);
  }

  function esign(loadId, type) {
    const key=`${loadId}-${type}`;
    setSigned({...signed,[key]:true});
    setDocs(prev=>prev.map(d=>d.loadId===loadId&&d.type===type?{...d,esigned:true,status:"signed"}:d));
    setFlash(`Rate Confirmation e-signed for ${loadId}`);
    setTimeout(()=>setFlash(null),3000);
  }

  const ST_CFG = { signed:{ c:T.gold, bg:T.goldBg, icon:"ti-pen" }, approved:{ c:T.greenText, bg:T.greenBg, icon:"ti-circle-check" }, pending:{ c:T.amberText, bg:T.amberBg, icon:"ti-clock" }, missing:{ c:T.redText, bg:T.redBg, icon:"ti-file-x" } };

  return (
    <div>
      <SectionTitle title="Document Hub" sub="Upload, e-sign, and manage all load & compliance documents"
        action={<Btn variant="primary" small><i className="ti ti-upload" aria-hidden /> Upload</Btn>} />
      {flash&&<Alert type="success" msg={flash} />}

      <div style={{ display:"flex", flexDirection:"column", gap:14, marginBottom:24 }}>
        {activeLoads.map(load=>{
          const reqs=LOAD_REQS[load.id]||[];
          const complete=reqs.every(r=>["approved","signed"].includes(getStatus(load.id,r)));
          return (
            <Card key={load.id} accent={complete?T.green+44:T.border}>
              <CardHeader title={`${load.id} — ${load.origin} → ${load.dest}`} sub={`${load.shipper} · ${load.equipment}`}
                right={<Pill label={complete?"Complete":"Incomplete"} color={complete?T.greenText:T.amberText} bg={complete?T.greenBg:T.amberBg} small />} />
              <div style={{ padding:"12px 18px" }}>
                {reqs.map(type=>{
                  const doc=getDoc(load.id,type);
                  const s=getStatus(load.id,type);
                  const st=ST_CFG[s]||ST_CFG.missing;
                  const upKey=`${load.id}-${type}`;
                  const isUploading=uploading===upKey;
                  return (
                    <div key={type} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 0", borderBottom:`0.5px solid ${T.border}` }}>
                      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                        <div style={{ width:34, height:34, borderRadius:8, background:st.bg, display:"flex", alignItems:"center", justifyContent:"center" }}>
                          <i className={`ti ${st.icon}`} style={{ fontSize:16, color:st.c }} aria-hidden />
                        </div>
                        <div>
                          <div style={{ fontSize:13, fontWeight:700, color:T.text }}>{type}</div>
                          <div style={{ fontSize:11, color:T.muted }}>
                            {doc?.uploaded?`${doc.uploader} · ${doc.uploaded} · ${doc.size}`:"Not yet uploaded"}
                            {doc?.esigned&&<span style={{ color:T.goldText }}> · ✓ E-Signed</span>}
                          </div>
                        </div>
                      </div>
                      <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                        <Pill label={s==="signed"?"E-Signed":s.charAt(0).toUpperCase()+s.slice(1)} color={st.c} bg={st.bg} small />
                        {s==="missing"||s==="pending"?(
                          <Btn variant="ghost" small onClick={()=>upload(load.id,type)} disabled={isUploading}>
                            {isUploading?<><i className="ti ti-loader" aria-hidden />Uploading…</>:<><i className="ti ti-upload" aria-hidden />Upload</>}
                          </Btn>
                        ):null}
                        {s==="approved"&&type==="Rate Confirmation"&&!doc?.esigned&&(
                          <Btn variant="purple" small onClick={()=>esign(load.id,type)}>
                            <i className="ti ti-pen" aria-hidden /> E-Sign
                          </Btn>
                        )}
                        {["approved","signed"].includes(s)&&(
                          <Btn variant="ghost" small><i className="ti ti-download" aria-hidden /></Btn>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Carrier compliance docs */}
      <SectionTitle title="Carrier Compliance Documents" sub="Authority, insurance, filings on file" />
      <Card>
        {[
          { name:"MC Operating Authority (MC-847291)", status:"approved", exp:"Permanent", icon:"ti-shield-check" },
          { name:"DOT Number (DOT-3841029)", status:"approved", exp:"Permanent", icon:"ti-shield-check" },
          { name:"Cargo Insurance — $100K", status:"approved", exp:"Feb 28 2025", icon:"ti-shield-check" },
          { name:"Liability Insurance — $1M", status:"expiring", exp:"Jan 15 2025 ⚠", icon:"ti-shield-exclamation" },
          { name:"Physical Damage Coverage", status:"approved", exp:"Jun 30 2025", icon:"ti-shield-check" },
          { name:"W-9 / EIN Verification", status:"approved", exp:"Permanent", icon:"ti-file-certificate" },
          { name:"BOC-3 Process Agent", status:"approved", exp:"Permanent", icon:"ti-file-certificate" },
          { name:"Drug & Alcohol Consortium", status:"approved", exp:"Dec 31 2025", icon:"ti-shield-check" },
        ].map((d,i,arr)=>{
          const c=d.status==="approved"?T.greenText:T.amberText;
          const bg=d.status==="approved"?T.greenBg:T.amberBg;
          return (
            <div key={d.name} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 18px", borderBottom:i<arr.length-1?`0.5px solid ${T.border}`:"none" }}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <i className={`ti ${d.icon}`} style={{ fontSize:18, color:c }} aria-hidden />
                <div>
                  <div style={{ fontSize:13, fontWeight:600, color:T.text }}>{d.name}</div>
                  <div style={{ fontSize:11, color:T.muted }}>Expires: {d.exp}</div>
                </div>
              </div>
              <div style={{ display:"flex", gap:7 }}>
                <Pill label={d.status==="approved"?"Active":"Expiring Soon"} color={c} bg={bg} small />
                <Btn variant="ghost" small><i className="ti ti-download" aria-hidden /></Btn>
              </div>
            </div>
          );
        })}
      </Card>
    </div>
  );
}

// ─── PAYMENT TRACKER ─────────────────────────────────────────────
function Payments() {
  const [invoices, setInvoices] = useState(INVOICES);
  const [qpModal, setQpModal] = useState(null);
  const [qpDone, setQpDone] = useState({});
  const [bankModal, setBankModal] = useState(false);
  const [bankConnected, setBankConnected] = useState(false);
  const [factorModal, setFactorModal] = useState(null);

  const pending=invoices.filter(i=>["submitted","approved"].includes(i.status)).reduce((s,i)=>s+i.amount,0);
  const paid=invoices.filter(i=>i.status==="paid").reduce((s,i)=>s+i.amount,0);

  function doQuickPay(inv) {
    setInvoices(prev=>prev.map(i=>i.id===inv.id?{...i,status:"paid",paid:"Today (Quick Pay)"}:i));
    setQpDone({...qpDone,[inv.id]:true}); setQpModal(null);
  }

  function submitInvoice(id) { setInvoices(prev=>prev.map(i=>i.id===id?{...i,status:"submitted",invoiced:"Today",due:"Jan 15 2025"}:i)); }

  return (
    <div>
      <SectionTitle title="Payment Tracker" sub="Invoice lifecycle · Quick Pay · factoring · ACH"
        action={<Btn variant="primary" small onClick={()=>setBankModal(true)}><i className="ti ti-building-bank" aria-hidden /> {bankConnected?"Bank Connected ✓":"Connect Bank"}</Btn>} />

      {!bankConnected&&<Alert type="warn" msg="Connect your bank account to enable ACH payments, Quick Pay, and automatic remittance matching." onDismiss={()=>setBankModal(true)} />}

      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:20 }}>
        {[
          {l:"Pending / In Review", v:`$${pending.toLocaleString()}`, c:T.amberText, bg:T.amberBg, i:"ti-hourglass"},
          {l:"Collected This Month", v:`$${paid.toLocaleString()}`, c:T.greenText, bg:T.greenBg, i:"ti-circle-check"},
          {l:"30-Day Cash Flow Est.", v:`$${(pending+paid+2100).toLocaleString()}`, c:T.blueText, bg:T.blueBg, i:"ti-trending-up"},
        ].map(m=>(
          <div key={m.l} style={{ background:m.bg, borderRadius:10, padding:"14px 16px", border:`0.5px solid ${m.c}44` }}>
            <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:6 }}>
              <i className={`ti ${m.i}`} style={{ fontSize:15, color:m.c }} aria-hidden />
              <span style={{ fontSize:10, color:m.c, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em" }}>{m.l}</span>
            </div>
            <div style={{ fontSize:22, fontWeight:900, color:m.c, fontFamily:"Georgia,serif" }}>{m.v}</div>
          </div>
        ))}
      </div>

      {/* Quick Pay modal */}
      {qpModal&&(
        <div style={{ minHeight:280, display:"flex", alignItems:"center", justifyContent:"center", marginBottom:16 }}>
          <Card style={{ maxWidth:420, width:"100%", border:`1.5px solid ${T.gold}` }}>
            <CardHeader title="Quick Pay Offer" sub="Get paid today — no waiting 15–30 days" />
            <div style={{ padding:"18px 20px" }}>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:14 }}>
                <div style={{ background:T.surface, borderRadius:8, padding:"12px 14px" }}>
                  <div style={{ fontSize:9, color:T.faint, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:3 }}>Invoice Total</div>
                  <div style={{ fontSize:20, fontWeight:900, color:T.text, fontFamily:"Georgia,serif" }}>${qpModal.amount.toLocaleString()}</div>
                </div>
                <div style={{ background:T.goldBg, borderRadius:8, padding:"12px 14px" }}>
                  <div style={{ fontSize:9, color:T.gold, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:3 }}>You Receive Today</div>
                  <div style={{ fontSize:20, fontWeight:900, color:T.gold, fontFamily:"Georgia,serif" }}>${(qpModal.amount-qpModal.quickPayFee).toLocaleString()}</div>
                </div>
              </div>
              <div style={{ fontSize:12, color:T.muted, marginBottom:16 }}>
                3% fee: ${qpModal.quickPayFee} · Funds via ACH — same business day · No recourse factoring
              </div>
              <div style={{ display:"flex", gap:8 }}>
                <Btn variant="primary" onClick={()=>doQuickPay(qpModal)} fullWidth><i className="ti ti-bolt" aria-hidden /> Accept Quick Pay</Btn>
                <Btn variant="ghost" onClick={()=>setQpModal(null)}>Cancel</Btn>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Bank Connect Modal */}
      {bankModal&&(
        <div style={{ minHeight:360, display:"flex", alignItems:"center", justifyContent:"center", marginBottom:16 }}>
          <Card style={{ maxWidth:440, width:"100%", border:`1.5px solid ${T.border}` }}>
            <CardHeader title="Connect Bank Account" sub="Powered by Plaid — bank-grade security" />
            <div style={{ padding:"18px 20px" }}>
              <Alert type="info" msg="We use Plaid to securely verify your bank account for ACH transfers. Your credentials are never stored on our servers." />
              <Input label="Bank Routing Number" placeholder="021000021" />
              <Input label="Account Number" placeholder="••••••••••••" type="password" />
              <Input label="Account Type" placeholder="Checking" />
              <div style={{ fontSize:11, color:T.faint, marginBottom:14 }}>
                256-bit encryption · FDIC insured · Plaid verified · Compliant with Nacha ACH rules
              </div>
              <div style={{ display:"flex", gap:8 }}>
                <Btn variant="primary" onClick={()=>{ setBankConnected(true); setBankModal(false); }} fullWidth>
                  <i className="ti ti-building-bank" aria-hidden /> Connect Securely
                </Btn>
                <Btn variant="ghost" onClick={()=>setBankModal(false)}>Cancel</Btn>
              </div>
            </div>
          </Card>
        </div>
      )}

      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        {invoices.map(inv=>{
          const st=INV_STATUS_CFG[inv.status];
          const load=LOADS.find(l=>l.id===inv.loadId);
          const isPaid=inv.status==="paid"||qpDone[inv.id];
          return (
            <Card key={inv.id}>
              <div style={{ padding:"14px 18px" }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                    <div style={{ width:38, height:38, borderRadius:9, background:st.bg, display:"flex", alignItems:"center", justifyContent:"center" }}>
                      <i className={`ti ti-receipt-2`} style={{ fontSize:18, color:st.color }} aria-hidden />
                    </div>
                    <div>
                      <div style={{ fontSize:14, fontWeight:700, color:T.text }}>{inv.id} · {inv.shipper}</div>
                      <div style={{ fontSize:11, color:T.muted }}>{load?.origin} → {load?.dest} · {inv.loadId}</div>
                    </div>
                  </div>
                  <div style={{ textAlign:"right" }}>
                    <div style={{ fontSize:20, fontWeight:900, color:T.text, fontFamily:"Georgia,serif" }}>${inv.amount.toLocaleString()}</div>
                    <Pill label={isPaid?"Paid":st.label} color={isPaid?T.greenText:st.color} bg={isPaid?T.greenBg:st.bg} small />
                  </div>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8, marginBottom:12 }}>
                  {[{l:"Invoiced",v:inv.invoiced||"—"},{l:"Due",v:inv.due||"—"},{l:"Paid",v:inv.paid||qpDone[inv.id]?"Today":"—"},{l:"Avg Pay",v:`${inv.avgPayDays}d`}].map(m=>(
                    <div key={m.l} style={{ background:T.surface, borderRadius:7, padding:"7px 10px" }}>
                      <div style={{ fontSize:9, color:T.faint, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:2 }}>{m.l}</div>
                      <div style={{ fontSize:12, fontWeight:700, color:T.text }}>{m.v}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display:"flex", gap:7 }}>
                  {inv.status==="draft"&&<Btn variant="primary" small onClick={()=>submitInvoice(inv.id)}><i className="ti ti-send" aria-hidden />Submit Invoice</Btn>}
                  {inv.status==="approved"&&!qpDone[inv.id]&&(
                    <Btn variant="purple" small onClick={()=>setQpModal(inv)}>
                      <i className="ti ti-bolt" aria-hidden /> Quick Pay — Get ${(inv.amount-inv.quickPayFee).toLocaleString()} Today
                    </Btn>
                  )}
                  <Btn variant="ghost" small><i className="ti ti-eye" aria-hidden /> View</Btn>
                  <Btn variant="ghost" small><i className="ti ti-download" aria-hidden /> PDF</Btn>
                </div>
              </div>
              {!isPaid&&inv.status==="approved"&&(
                <div style={{ background:T.amberBg, borderTop:`0.5px solid ${T.border}`, padding:"8px 18px", display:"flex", alignItems:"center", gap:8 }}>
                  <i className="ti ti-clock" style={{ fontSize:13, color:T.amberText }} aria-hidden />
                  <span style={{ fontSize:12, color:T.amberText, fontWeight:600 }}>Est. payment in ~{inv.avgPayDays} days · Quick Pay available</span>
                </div>
              )}
              {isPaid&&(
                <div style={{ background:T.greenBg, borderTop:`0.5px solid ${T.border}`, padding:"8px 18px", display:"flex", alignItems:"center", gap:8 }}>
                  <i className="ti ti-circle-check" style={{ fontSize:13, color:T.greenText }} aria-hidden />
                  <span style={{ fontSize:12, color:T.greenText, fontWeight:600 }}>Paid {inv.paid||"Today (Quick Pay)"} · ACH confirmed</span>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ─── DRIVER MANAGEMENT ───────────────────────────────────────────
function Drivers() {
  const [sel, setSel] = useState("D-01");
  const [addModal, setAddModal] = useState(false);
  const [newDriver, setNewDriver] = useState({ name:"", email:"", phone:"", cdl:"", equipment:"Dry Van" });
  const [driverList, setDriverList] = useState(DRIVERS);
  const drv = driverList.find(d=>d.id===sel);

  function nf(k) { return { value:newDriver[k], onChange:e=>setNewDriver({...newDriver,[k]:e.target.value}) }; }

  const daysLeft=(exp)=>Math.round((new Date(exp)-new Date())/(1000*60*60*24));

  return (
    <div>
      <SectionTitle title="Driver Management" sub={`${driverList.length} drivers · ${driverList.filter(d=>d.status==="driving").length} on road`}
        action={<Btn variant="primary" small onClick={()=>setAddModal(true)}><i className="ti ti-user-plus" aria-hidden /> Add Driver</Btn>} />

      {addModal&&(
        <div style={{ minHeight:420, display:"flex", alignItems:"center", justifyContent:"center", marginBottom:16 }}>
          <Card style={{ maxWidth:440, width:"100%", border:`1.5px solid ${T.border}` }}>
            <CardHeader title="Add Driver" sub="New driver profile & onboarding" />
            <div style={{ padding:"18px 20px" }}>
              <Alert type="info" msg="Driver will receive an onboarding email with ELD pairing instructions and a link to upload their CDL and medical card." />
              <Input label="Full Name" placeholder="Marcus Webb" {...nf("name")} />
              <Input label="Email" type="email" placeholder="driver@yourcompany.com" {...nf("email")} />
              <Input label="Phone" placeholder="(614) 555-0182" {...nf("phone")} />
              <Input label="CDL Number" placeholder="OH-CDL-448821" {...nf("cdl")} />
              <div style={{ display:"flex", gap:8, marginTop:4 }}>
                <Btn variant="primary" onClick={()=>setAddModal(false)} fullWidth><i className="ti ti-user-plus" aria-hidden /> Add & Invite</Btn>
                <Btn variant="ghost" onClick={()=>setAddModal(false)}>Cancel</Btn>
              </div>
            </div>
          </Card>
        </div>
      )}

      <div style={{ display:"grid", gridTemplateColumns:"1fr 320px", gap:16 }}>
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {driverList.map(d=>{
            const st=DRV_STATUS_CFG[d.status];
            const cdlDays=daysLeft(d.cdlExp);
            const isSel=sel===d.id;
            const load=LOADS.find(l=>l.id===d.currentLoad);
            return (
              <Card key={d.id} accent={isSel?T.gold:T.border} style={{ cursor:"pointer" }}>
                <div onClick={()=>setSel(d.id)} style={{ padding:"14px 18px" }}>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                      <div style={{ width:42, height:42, borderRadius:"50%", background:isSel?T.goldBg:T.purpleBg, display:"flex", alignItems:"center", justifyContent:"center", fontSize:15, fontWeight:800, color:isSel?T.goldText:T.purpleText }}>
                        {d.initials}
                      </div>
                      <div>
                        <div style={{ fontSize:14, fontWeight:700, color:T.text }}>{d.name}</div>
                        <div style={{ fontSize:11, color:T.muted }}>{d.truck} · {d.equipment} · {d.homeBase}</div>
                      </div>
                    </div>
                    <div style={{ textAlign:"right" }}>
                      <Pill label={st.label} color={st.color} bg={st.bg} small />
                      {cdlDays<120&&<div style={{ marginTop:4 }}><Pill label={`CDL: ${cdlDays}d left`} color={T.amberText} bg={T.amberBg} small /></div>}
                      {d.eldConnected&&<div style={{ fontSize:10, color:T.greenText, marginTop:4 }}>● ELD Live</div>}
                    </div>
                  </div>
                  <div style={{ marginTop:12, display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:7, textAlign:"center" }}>
                    {[{l:"Miles",v:d.miles.toLocaleString()},{l:"On-Time",v:`${d.onTime}%`},{l:"Rating",v:`${d.rating}/5`},{l:"Violations",v:d.violations}].map(m=>(
                      <div key={m.l} style={{ background:T.surface, borderRadius:7, padding:"6px 8px" }}>
                        <div style={{ fontSize:12, fontWeight:700, color:T.text }}>{m.v}</div>
                        <div style={{ fontSize:10, color:T.faint, marginTop:1 }}>{m.l}</div>
                      </div>
                    ))}
                  </div>
                  {load&&<div style={{ marginTop:10, background:d.status==="driving"?T.purpleBg:T.surface, borderRadius:7, padding:"7px 12px", display:"flex", alignItems:"center", gap:7 }}>
                    <i className="ti ti-truck" style={{ fontSize:13, color:d.status==="driving"?T.purpleText:T.muted }} aria-hidden />
                    <span style={{ fontSize:12, color:d.status==="driving"?T.purpleText:T.muted, fontWeight:600 }}>{load.origin} → {load.dest} · {load.id}</span>
                  </div>}
                </div>
              </Card>
            );
          })}
        </div>

        {drv&&<Card>
          <CardHeader title={drv.name} sub={`${drv.truck} · ${drv.equipment}`} />
          <div style={{ padding:"16px 18px" }}>
            <div style={{ fontSize:10, color:T.faint, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:10 }}>Credentials & Compliance</div>
            {[
              {l:"CDL Number", v:drv.cdl},
              {l:"CDL Expires", v:drv.cdlExp, warn:daysLeft(drv.cdlExp)<120},
              {l:"Medical Card", v:drv.medCard},
              {l:"Drug Test", v:drv.drugTest},
              {l:"MVR Pull", v:drv.mvr},
              {l:"Accidents (3yr)", v:drv.accidents},
              {l:"Violations (3yr)", v:drv.violations, warn:drv.violations>0},
            ].map(r=>(
              <Row key={r.l} label={r.l} value={`${r.v}${r.warn?" ⚠":""}`} color={r.warn?T.amberText:T.text} />
            ))}
            <div style={{ fontSize:10, color:T.faint, textTransform:"uppercase", letterSpacing:"0.07em", marginTop:14, marginBottom:10 }}>HOS (Hours of Service)</div>
            {[
              {l:"Drive time",pct:(drv.hos.drive/11)*100,v:`${drv.hos.drive.toFixed(1)}h / 11h`,c:drv.hos.drive>9?T.red:T.amber},
              {l:"On-duty",pct:(drv.hos.onDuty/14)*100,v:`${drv.hos.onDuty}h / 14h`,c:drv.hos.onDuty>12?T.red:T.green},
              {l:"Cycle",pct:(drv.hos.cycle/70)*100,v:`${drv.hos.cycle}h / 70h`,c:T.green},
            ].map(h=>(
              <div key={h.l} style={{ marginBottom:10 }}>
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:4 }}>
                  <span style={{ color:T.muted }}>{h.l}</span>
                  <span style={{ fontWeight:700, color:h.c }}>{h.v}</span>
                </div>
                <Progress pct={h.pct} color={h.c} />
              </div>
            ))}
            <div style={{ marginTop:14, display:"flex", gap:7 }}>
              <Btn variant="primary" small fullWidth><i className="ti ti-message" aria-hidden /> Message</Btn>
              <Btn variant="ghost" small><i className="ti ti-phone" aria-hidden /></Btn>
              <Btn variant="ghost" small><i className="ti ti-file-text" aria-hidden /></Btn>
            </div>
          </div>
        </Card>}
      </div>
    </div>
  );
}

// ─── FLEET / TRUCKS ───────────────────────────────────────────────
function Fleet() {
  return (
    <div>
      <SectionTitle title="Fleet Management" sub="Trucks, trailers, maintenance & inspections"
        action={<Btn variant="primary" small><i className="ti ti-plus" aria-hidden /> Add Vehicle</Btn>} />
      <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
        {TRUCKS.map(t=>{
          const driver=DRIVERS.find(d=>d.id===t.driverId);
          const pmDue=t.odometer>=t.nextPM-1000;
          return (
            <Card key={t.id}>
              <div style={{ padding:"16px 20px" }}>
                <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:14 }}>
                  <div>
                    <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                      <div style={{ width:40, height:40, borderRadius:9, background:T.goldBg, display:"flex", alignItems:"center", justifyContent:"center" }}>
                        <i className="ti ti-truck" style={{ fontSize:20, color:T.gold }} aria-hidden />
                      </div>
                      <div>
                        <div style={{ fontSize:15, fontWeight:800, color:T.text, fontFamily:"Georgia,serif" }}>{t.id} — {t.year} {t.make} {t.model}</div>
                        <div style={{ fontSize:11, color:T.muted }}>{t.plate} · {t.vin} · {t.equipment}</div>
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign:"right" }}>
                    <Pill label={t.status==="in_service"?"In Service":"Available"} color={t.status==="in_service"?T.purpleText:T.greenText} bg={t.status==="in_service"?T.purpleBg:T.greenBg} small />
                    {pmDue&&<div style={{ marginTop:4 }}><Pill label="PM Due Soon" color={T.amberText} bg={T.amberBg} small /></div>}
                  </div>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(6,1fr)", gap:8, marginBottom:14 }}>
                  {[{l:"Odometer",v:`${t.odometer.toLocaleString()} mi`},{l:"Next PM",v:`${t.nextPM.toLocaleString()} mi`},{l:"Trailer",v:t.trailer},{l:"Tires",v:t.tires},{l:"Registration",v:t.registration},{l:"DOT Inspection",v:t.annualInspection}].map(m=>(
                    <div key={m.l} style={{ background:T.surface, borderRadius:7, padding:"8px 10px" }}>
                      <div style={{ fontSize:9, color:T.faint, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:2 }}>{m.l}</div>
                      <div style={{ fontSize:11, fontWeight:700, color:T.text }}>{m.v}</div>
                    </div>
                  ))}
                </div>
                {driver&&<div style={{ display:"flex", alignItems:"center", gap:10, background:T.surface, borderRadius:8, padding:"9px 14px" }}>
                  <div style={{ width:28, height:28, borderRadius:"50%", background:T.purpleBg, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:800, color:T.purpleText }}>{driver.initials}</div>
                  <div style={{ fontSize:12, color:T.text }}>Assigned: <span style={{ fontWeight:700 }}>{driver.name}</span></div>
                  <Pill label={DRV_STATUS_CFG[driver.status].label} color={DRV_STATUS_CFG[driver.status].color} bg={DRV_STATUS_CFG[driver.status].bg} small />
                </div>}
                <div style={{ marginTop:10, display:"flex", gap:7 }}>
                  <Btn variant="ghost" small><i className="ti ti-tool" aria-hidden /> Log Maintenance</Btn>
                  <Btn variant="ghost" small><i className="ti ti-file-certificate" aria-hidden /> Inspection</Btn>
                  <Btn variant="ghost" small><i className="ti ti-edit" aria-hidden /> Edit</Btn>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <div style={{ marginTop:24 }}>
        <SectionTitle title="Maintenance Log" sub="Service history across fleet" />
        <Card>
          {MAINTENANCE.map((m,i,arr)=>(
            <div key={m.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"11px 18px", borderBottom:i<arr.length-1?`0.5px solid ${T.border}`:"none" }}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <div style={{ width:32, height:32, borderRadius:7, background:m.status==="upcoming"?T.amberBg:T.greenBg, display:"flex", alignItems:"center", justifyContent:"center" }}>
                  <i className={`ti ti-${m.status==="upcoming"?"clock":"circle-check"}`} style={{ fontSize:15, color:m.status==="upcoming"?T.amberText:T.greenText }} aria-hidden />
                </div>
                <div>
                  <div style={{ fontSize:13, fontWeight:700, color:T.text }}>{m.truckId} — {m.type}</div>
                  <div style={{ fontSize:11, color:T.muted }}>{m.date||"Upcoming"}{m.shop?` · ${m.shop}`:""}{m.odometer?` · ${m.odometer.toLocaleString()} mi`:""}</div>
                </div>
              </div>
              <div style={{ textAlign:"right" }}>
                {m.cost&&<div style={{ fontSize:13, fontWeight:700, color:T.text }}>${m.cost.toLocaleString()}</div>}
                <div style={{ fontSize:11, color:T.faint }}>{m.next}</div>
              </div>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

// ─── COMPLIANCE CENTER ────────────────────────────────────────────
function Compliance() {
  const expiring=COMPLIANCE_ITEMS.filter(c=>c.status==="expiring");
  const daysLeft=(exp)=>exp?Math.round((new Date(exp)-new Date())/(1000*60*60*24)):null;
  const cats=["All","Authority","Insurance","Filing","Tax","Safety","Drug"];
  const [cat,setCat]=useState("All");
  const filtered=COMPLIANCE_ITEMS.filter(c=>cat==="All"||c.category===cat);

  return (
    <div>
      <SectionTitle title="Compliance Center" sub="FMCSA authority · insurance · filings · driver credentials" />
      {expiring.length>0&&<Alert type="warn" msg={`${expiring.length} items expiring soon: ${expiring.map(e=>e.name).join(" · ")}. Renew immediately to avoid FMCSA issues and load rejections.`} />}

      <div style={{ display:"flex", gap:6, marginBottom:16, flexWrap:"wrap" }}>
        {cats.map(c=>(
          <button key={c} onClick={()=>setCat(c)} style={{ padding:"5px 12px", borderRadius:6, fontSize:11, fontWeight:600, border:`0.5px solid ${cat===c?T.gold:T.border}`, background:cat===c?T.goldBg:"transparent", color:cat===c?T.goldText:T.muted, cursor:"pointer" }}>{c}</button>
        ))}
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:10, marginBottom:24 }}>
        {filtered.map(c=>{
          const dl=daysLeft(c.expires);
          const warn=dl!==null&&dl<60;
          return (
            <Card key={c.id} accent={warn?T.amber:T.border}>
              <div style={{ padding:"14px 16px" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
                  <div style={{ display:"flex", gap:9 }}>
                    <div style={{ width:34, height:34, borderRadius:8, background:warn?T.amberBg:T.greenBg, display:"flex", alignItems:"center", justifyContent:"center" }}>
                      <i className={`ti ti-shield-${warn?"exclamation":"check"}`} style={{ fontSize:17, color:warn?T.amberText:T.greenText }} aria-hidden />
                    </div>
                    <div>
                      <div style={{ fontSize:13, fontWeight:700, color:T.text }}>{c.name}</div>
                      <div style={{ fontSize:11, color:T.muted }}>{c.issuer}</div>
                    </div>
                  </div>
                  <Pill label={warn?"Expiring Soon":"Active"} color={warn?T.amberText:T.greenText} bg={warn?T.amberBg:T.greenBg} small />
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
                  <div style={{ background:T.surface, borderRadius:6, padding:"6px 9px" }}>
                    <div style={{ fontSize:9, color:T.faint, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:2 }}>Number</div>
                    <div style={{ fontSize:11, fontWeight:700, color:T.text }}>{c.number}</div>
                  </div>
                  <div style={{ background:warn?T.amberBg:T.surface, borderRadius:6, padding:"6px 9px" }}>
                    <div style={{ fontSize:9, color:T.faint, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:2 }}>Expires</div>
                    <div style={{ fontSize:11, fontWeight:700, color:warn?T.amberText:T.text }}>{c.expires||"Permanent"}{dl!==null?` (${dl}d)`:""}</div>
                  </div>
                </div>
                {c.limit&&<div style={{ marginTop:6, fontSize:11, color:T.muted }}>Coverage limit: {c.limit}</div>}
                {warn&&<Btn variant="ghost" small style={{ marginTop:8, width:"100%", justifyContent:"center" }}>
                  <i className="ti ti-refresh" aria-hidden /> Renew Now
                </Btn>}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Shipper verification tool */}
      <SectionTitle title="Shipper Directory" sub="FMCSA-verified shipper grades · payment history" />
      <Card>
        {SHIPPERS.map((s,i,arr)=>(
          <div key={s.id} style={{ padding:"14px 18px", borderBottom:i<arr.length-1?`0.5px solid ${T.border}`:"none" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <div style={{ width:36, height:36, borderRadius:8, background:T.goldBg, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, fontWeight:900, color:T.gold }}>
                  {s.grade}
                </div>
                <div>
                  <div style={{ fontSize:14, fontWeight:700, color:T.text }}>{s.name}</div>
                  <div style={{ fontSize:11, color:T.muted }}>{s.mc} · {s.dot}</div>
                </div>
              </div>
              <div style={{ display:"flex", gap:6 }}>
                <Pill label={s.verified?"✓ FMCSA Verified":"⚠ Unverified"} color={s.verified?T.greenText:T.amberText} bg={s.verified?T.greenBg:T.amberBg} small />
                <Pill label={`Grade ${s.grade}`} color={T.goldText} bg={T.goldBg} small />
              </div>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:7, textAlign:"center" }}>
              {[{l:"Avg Pay",v:`${s.avgPayDays}d`},{l:"On-Time",v:`${s.onTime}%`},{l:"Loads",v:s.loads},{l:"Total Paid",v:`$${(s.totalPaid/1000).toFixed(0)}k`},{l:"Since",v:s.since.slice(0,7)}].map(m=>(
                <div key={m.l} style={{ background:T.surface, borderRadius:7, padding:"6px 8px" }}>
                  <div style={{ fontSize:12, fontWeight:700, color:T.text }}>{m.v}</div>
                  <div style={{ fontSize:10, color:T.faint, marginTop:1 }}>{m.l}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

// ─── ANALYTICS ───────────────────────────────────────────────────
function Analytics() {
  useEffect(()=>{
    if(typeof Chart==="undefined") return;
    const ids=["ch1","ch2","ch3","ch4"];
    const charts=[];
    const c1=document.getElementById("ch1"); if(c1&&!c1._c){
      c1._c=new Chart(c1,{type:"line",data:{labels:["Nov 4","Nov 11","Nov 18","Nov 25","Dec 2","Dec 9","Dec 16"],datasets:[
        {label:"Revenue",data:[6800,9200,8100,12400,10900,14800,17200],borderColor:"#e8a830",backgroundColor:"#e8a83018",tension:0.4,fill:true,borderWidth:2},
        {label:"Net Profit",data:[2100,3400,2800,5100,4200,6200,7400],borderColor:"#2ecc71",backgroundColor:"#2ecc7118",tension:0.4,fill:true,borderWidth:2}
      ]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{ticks:{callback:v=>"$"+(v/1000).toFixed(0)+"k",font:{size:10},color:"#5a5548"},grid:{color:"#333028"},border:{color:"transparent"}},x:{ticks:{font:{size:10},color:"#5a5548"},grid:{display:false}}}}});
    }
    const c2=document.getElementById("ch2"); if(c2&&!c2._c){
      c2._c=new Chart(c2,{type:"doughnut",data:{labels:["Fuel 24%","Operating 31%","Maint 8%","Net 37%"],datasets:[{data:[24,31,8,37],backgroundColor:["#e74c3c","#f39c12","#888780","#2ecc71"],borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,cutout:"70%",plugins:{legend:{display:false}}}});
    }
    const c3=document.getElementById("ch3"); if(c3&&!c3._c){
      c3._c=new Chart(c3,{type:"bar",data:{labels:["Dry Van","Reefer","Flatbed"],datasets:[{label:"Avg Net",data:[248,696,687],backgroundColor:["#e8a830","#2ecc71","#9b59b6"],borderRadius:5}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{ticks:{callback:v=>"$"+v,font:{size:10},color:"#5a5548"},grid:{color:"#333028"},border:{color:"transparent"}},x:{ticks:{color:"#5a5548"},grid:{display:false}}}}});
    }
    const c4=document.getElementById("ch4"); if(c4&&!c4._c){
      c4._c=new Chart(c4,{type:"bar",data:{labels:["Acme Freight","Global Cold","NE Freight","MidSouth"],datasets:[{label:"Revenue",data:[22840,14880,11760,3920],backgroundColor:"#e8a83044",borderColor:"#e8a830",borderWidth:1.5,borderRadius:5}]},options:{indexAxis:"y",responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{ticks:{callback:v=>"$"+(v/1000).toFixed(0)+"k",font:{size:10},color:"#5a5548"},grid:{color:"#333028"},border:{color:"transparent"}},y:{ticks:{color:"#5a5548"},grid:{display:false}}}}});
    }
    return ()=>charts.forEach(c=>c&&c.destroy&&c.destroy());
  },[]);

  return (
    <div>
      <SectionTitle title="Analytics" sub="Revenue · profitability · lane analysis · shipper performance" />
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:20 }}>
        {[{l:"Revenue MTD",v:"$24,840",d:"18 loads",c:T.goldText},{l:"Net Profit MTD",v:"$6,952",d:"~28% margin",c:T.greenText},{l:"Avg RPM",v:"$2.67",d:"Mid-market",c:T.purpleText},{l:"Loads Completed",v:"18",d:"+4 vs last",c:T.blueText}].map(m=>(
          <div key={m.l} style={{ background:T.card, border:`0.5px solid ${T.border}`, borderRadius:10, padding:"14px 16px" }}>
            <div style={{ fontSize:10, color:T.muted, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:6 }}>{m.l}</div>
            <div style={{ fontSize:22, fontWeight:900, color:m.c, fontFamily:"Georgia,serif", letterSpacing:"-0.02em" }}>{m.v}</div>
            <div style={{ fontSize:11, color:T.green, marginTop:4 }}>↑ {m.d}</div>
          </div>
        ))}
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr", gap:16, marginBottom:16 }}>
        <Card>
          <CardHeader title="Revenue & Net Profit Trend" />
          <div style={{ padding:"14px 20px" }}>
            <div style={{ display:"flex", gap:14, marginBottom:12 }}>
              <span style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, color:T.muted }}><span style={{ width:10, height:10, borderRadius:2, background:"#e8a830" }} />Revenue</span>
              <span style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, color:T.muted }}><span style={{ width:10, height:10, borderRadius:2, background:"#2ecc71" }} />Net Profit</span>
            </div>
            <div style={{ height:200, position:"relative" }}>
              <canvas id="ch1" role="img" aria-label="Line chart of weekly revenue and net profit trending upward over 7 weeks">Revenue rising from $6,800 to $17,200; Net profit from $2,100 to $7,400.</canvas>
            </div>
          </div>
        </Card>
        <Card>
          <CardHeader title="Revenue Composition" />
          <div style={{ padding:"14px 18px" }}>
            <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:12 }}>
              {[{l:"Net 37%",c:"#2ecc71"},{l:"Operating 31%",c:"#f39c12"},{l:"Fuel 24%",c:"#e74c3c"},{l:"Maint 8%",c:"#888"}].map(m=>(
                <span key={m.l} style={{ display:"flex", alignItems:"center", gap:4, fontSize:10, color:T.muted }}>
                  <span style={{ width:8, height:8, borderRadius:2, background:m.c, display:"inline-block" }} />{m.l}
                </span>
              ))}
            </div>
            <div style={{ height:160, position:"relative" }}>
              <canvas id="ch2" role="img" aria-label="Donut chart: Net profit 37%, Operating 31%, Fuel 24%, Maintenance 8%">Net 37%, Operating 31%, Fuel 24%, Maint 8%.</canvas>
            </div>
          </div>
        </Card>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
        <Card>
          <CardHeader title="Net Profit by Equipment Type" />
          <div style={{ padding:"14px 18px" }}>
            <div style={{ height:180, position:"relative" }}>
              <canvas id="ch3" role="img" aria-label="Bar chart comparing average net profit: Dry Van $1,380, Reefer $1,720, Flatbed $890">Reefer highest, Flatbed lowest.</canvas>
            </div>
          </div>
        </Card>
        <Card>
          <CardHeader title="Revenue by Shipper" />
          <div style={{ padding:"14px 18px" }}>
            <div style={{ height:180, position:"relative" }}>
              <canvas id="ch4" role="img" aria-label="Horizontal bar chart of revenue by shipper">Acme Freight $58k, Global Cold $35k, NE Freight $29k, MidSouth $8k.</canvas>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ─── SHIPPER PORTAL ───────────────────────────────────────────────
function ShipperPortal() {
  const [posted, setPosted] = useState(false);
  const [form, setForm] = useState({ origin:"", dest:"", equipment:"Dry Van", weight:"", rate:"", pickup:"", commodity:"" });
  function field(k){ return { value:form[k], onChange:e=>setForm({...form,[k]:e.target.value}) }; }

  return (
    <div>
      <SectionTitle title="Shipper Portal" sub="Post loads, verify carriers, sign rate confirmations, release payments" />
      <Alert type="info" msg="Shippers get their own login at shippers.Carrierpriority.com — no broker needed. They post loads, choose a carrier, e-sign the rate confirmation, and release payment all in one place." />
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
        <Card>
          <CardHeader title="Post a Load" sub="Direct to verified carriers" />
          <div style={{ padding:"16px 18px" }}>
            {posted ? (
              <Alert type="success" msg="Load posted! Matching carriers will be notified via SMS and app push. You'll receive offers within minutes." />
            ) : <>
              <Input label="Origin City, State" placeholder="Columbus, OH" {...field("origin")} />
              <Input label="Destination City, State" placeholder="Atlanta, GA" {...field("dest")} />
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                <div style={{ marginBottom:12 }}>
                  <label style={{ fontSize:11, color:T.muted, display:"block", marginBottom:5, textTransform:"uppercase", letterSpacing:"0.06em" }}>Equipment</label>
                  <select value={form.equipment} onChange={e=>setForm({...form,equipment:e.target.value})} style={{ width:"100%", padding:"9px 12px", fontSize:13, background:T.surface, border:`0.5px solid ${T.border}`, borderRadius:8, color:T.text }}>
                    <option>Dry Van</option><option>Reefer</option><option>Flatbed</option><option>Step Deck</option><option>Tanker</option>
                  </select>
                </div>
                <Input label="Weight (lbs)" placeholder="42,000" type="number" {...field("weight")} />
              </div>
              <Input label="All-In Rate ($)" placeholder="e.g. 1,491 for 587mi Dry Van @ $2.54/mi" type="number" {...field("rate")} />
              <Input label="Pickup Date/Time" placeholder="Dec 20 08:00 AM" {...field("pickup")} />
              <Input label="Commodity" placeholder="Auto Parts, Consumer Goods…" {...field("commodity")} />
              <Btn variant="primary" onClick={()=>setPosted(true)} fullWidth><i className="ti ti-send" aria-hidden /> Post to Load Board</Btn>
            </>}
          </div>
        </Card>
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <Card>
            <CardHeader title="Carrier Verification" sub="Instant FMCSA lookup" />
            <div style={{ padding:"16px 18px" }}>
              <Input label="Carrier MC or DOT Number" placeholder="MC-847291" />
              <Btn variant="ghost" fullWidth><i className="ti ti-search" aria-hidden /> Verify Carrier</Btn>
              <div style={{ marginTop:12, padding:"12px 14px", background:T.greenBg, borderRadius:9, border:`0.5px solid ${T.green}44` }}>
                <div style={{ fontSize:12, fontWeight:700, color:T.greenText, marginBottom:6 }}>✓ Stewart Trucking LLC — Verified</div>
                {[{l:"MC",v:"MC-847291"},{l:"DOT",v:"DOT-3841029"},{l:"Authority",v:"Active"},{l:"Insurance",v:"On File"},{l:"Safety Rating",v:"Satisfactory"},{l:"Cargo Ins",v:"$100K"},{l:"Liability",v:"$1M"}].map(r=>(
                  <Row key={r.l} label={r.l} value={r.v} color={T.greenText} />
                ))}
              </div>
            </div>
          </Card>
          <Card>
            <CardHeader title="E-Sign Rate Confirmation" sub="Legally binding digital signature" />
            <div style={{ padding:"16px 18px" }}>
              <div style={{ background:T.surface, borderRadius:9, padding:"14px 16px", marginBottom:12 }}>
                <div style={{ fontSize:12, fontWeight:700, color:T.text, marginBottom:8 }}>Rate Confirmation #RC-4412</div>
                {[{l:"Carrier",v:"Stewart Trucking LLC"},{l:"Load",v:"RL-4412 · Columbus→Atlanta"},{l:"Rate",v:"$2,847 All-In"},{l:"Equipment",v:"Dry Van"},{l:"Pickup",v:"Today 06:00"}].map(r=>(
                  <Row key={r.l} label={r.l} value={r.v} />
                ))}
              </div>
              <Btn variant="primary" fullWidth><i className="ti ti-pen" aria-hidden /> Sign Rate Confirmation</Btn>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ─── SETTINGS ────────────────────────────────────────────────────
function SettingsPanel() {
  const [saved, setSaved] = useState(false);
  const [s, setS] = useState({ mpg:"7.2", cpp:"1.65", target:"2.40", maxDead:"80", fuel:"3.85", emailAlerts:true, smsAlerts:true, pushAlerts:true, autoMatch:true, quickPay:true, eldSync:true, factoring:false, datFeed:true, truckstop:false });
  function toggle(k){ setS({...s,[k]:!s[k]}); }
  function field(k){ return { value:s[k], onChange:e=>setS({...s,[k]:e.target.value}) }; }

  const INTEGRATIONS = [
    { name:"DAT Load Board", desc:"Live load feed with 250k+ loads/day", key:"datFeed", tier:"Pro" },
    { name:"Truckstop.com", desc:"Additional load board feed", key:"truckstop", tier:"Pro" },
    { name:"Samsara ELD", desc:"Real-time GPS + HOS from your ELD", key:"eldSync", tier:"Fleet" },
    { name:"QuickBooks Online", desc:"Auto-sync invoices & expenses", key:null, tier:"Pro" },
    { name:"Comdata / EFS Fuel Cards", desc:"Fuel card integration & IFTA reporting", key:null, tier:"Fleet" },
    { name:"Triumph Business Capital", desc:"Factoring partner for instant payment", key:"factoring", tier:"Pro" },
    { name:"Plaid (ACH/Bank)", desc:"Bank account verification for payments", key:null, tier:"All" },
    { name:"Twilio SMS", desc:"Driver & shipper SMS notifications", key:"smsAlerts", tier:"All" },
  ];

  return (
    <div>
      <SectionTitle title="Settings" sub="Cost profile · notifications · integrations · account" />
      {saved&&<Alert type="success" msg="Settings saved successfully." />}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <Card>
            <CardHeader title="Cost Profile" sub="Feeds profit scoring engine" />
            <div style={{ padding:"16px 18px" }}>
              {[{l:"MPG",k:"mpg"},{l:"Cost per mile ($)",k:"cpp"},{l:"Target RPM — Dry Van $2.30–$2.68",k:"target"},{l:"Max deadhead (mi)",k:"maxDead"},{l:"Fuel price ($/gal)",k:"fuel"}].map(f=>(
                <Input key={f.k} label={f.l} type="number" {...field(f.k)} />
              ))}
            </div>
          </Card>
          <Card>
            <CardHeader title="Account" sub={`${ME.name} · ${ME.plan} plan`} />
            <div style={{ padding:"16px 18px" }}>
              {[{l:"Company",v:ME.name},{l:"MC Number",v:ME.mc},{l:"DOT Number",v:ME.dot},{l:"Plan",v:ME.plan+" — $149/mo"},{l:"Member Since",v:ME.since},{l:"Trucks",v:ME.truckCount}].map(r=>(
                <Row key={r.l} label={r.l} value={r.v} />
              ))}
              <div style={{ marginTop:14, display:"flex", gap:8 }}>
                <Btn variant="ghost" small><i className="ti ti-edit" aria-hidden /> Edit Profile</Btn>
                <Btn variant="danger" small><i className="ti ti-key" aria-hidden /> Change Password</Btn>
              </div>
            </div>
          </Card>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <Card>
            <CardHeader title="Notifications" />
            <div style={{ padding:"16px 18px" }}>
              {[
                {l:"Email — new matching loads",k:"emailAlerts"},
                {l:"SMS — load status & offers",k:"smsAlerts"},
                {l:"Push — payment & compliance",k:"pushAlerts"},
                {l:"Auto-match loads to cost profile",k:"autoMatch"},
                {l:"Quick Pay offers",k:"quickPay"},
                {l:"ELD sync (live GPS & HOS)",k:"eldSync"},
              ].map(n=>(
                <div key={n.k} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"9px 0", borderBottom:`0.5px solid ${T.border}` }}>
                  <span style={{ fontSize:13, color:T.muted }}>{n.l}</span>
                  <Toggle on={s[n.k]} onChange={()=>toggle(n.k)} />
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <CardHeader title="Integrations" sub="Connect your tools" />
            <div style={{ padding:"12px 18px" }}>
              {INTEGRATIONS.map(i=>(
                <div key={i.name} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"9px 0", borderBottom:`0.5px solid ${T.border}` }}>
                  <div>
                    <div style={{ fontSize:13, color:T.text, fontWeight:600 }}>{i.name}</div>
                    <div style={{ fontSize:10, color:T.faint }}>{i.desc}</div>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <Pill label={i.tier} color={T.goldText} bg={T.goldBg} small />
                    {i.key ? <Toggle on={s[i.key]||false} onChange={()=>i.key&&toggle(i.key)} /> : <Btn variant="ghost" small>Connect</Btn>}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
      <div style={{ marginTop:16, display:"flex", justifyContent:"flex-end" }}>
        <Btn variant="primary" onClick={()=>{ setSaved(true); setTimeout(()=>setSaved(false),3000); }}>
          <i className="ti ti-device-floppy" aria-hidden /> Save All Settings
        </Btn>
      </div>
    </div>
  );
}

// ─── MOBILE DRIVER VIEW ───────────────────────────────────────────
function MobileDriver() {
  const drv=DRIVERS[0];
  const load=LOADS.find(l=>l.id===drv.currentLoad);
  const [checkedIn, setCheckin]=useState(false);
  const [podDone, setPod]=useState(false);

  return (
    <div style={{ maxWidth:390, margin:"0 auto" }}>
      <SectionTitle title="Driver Mobile View" sub="Optimized for phones · PWA installable" />
      <div style={{ background:T.surface, borderRadius:16, border:`0.5px solid ${T.border}`, overflow:"hidden" }}>
        {/* Phone status bar */}
        <div style={{ background:T.bg, padding:"8px 16px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <span style={{ fontSize:11, color:T.muted }}>9:41 AM</span>
          <div style={{ display:"flex", gap:6 }}>
            <i className="ti ti-wifi" style={{ fontSize:13, color:T.muted }} aria-hidden />
            <i className="ti ti-battery-3" style={{ fontSize:13, color:T.muted }} aria-hidden />
          </div>
        </div>
        {/* App header */}
        <div style={{ background:T.gold, padding:"12px 18px", display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:32, height:32, background:"#000", borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center" }}>
            <i className="ti ti-truck" style={{ fontSize:16, color:T.gold }} aria-hidden />
          </div>
          <div>
            <div style={{ fontSize:14, fontWeight:900, color:"#000", fontFamily:"Georgia,serif" }}>CARRIER PRIORITY</div>
            <div style={{ fontSize:10, color:"#00000099" }}>Driver App · {drv.name}</div>
          </div>
        </div>
        {load&&<div style={{ padding:"16px" }}>
          <div style={{ background:T.card, borderRadius:12, padding:"14px", marginBottom:12 }}>
            <div style={{ fontSize:10, color:T.faint, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:6 }}>Current Load</div>
            <div style={{ fontSize:15, fontWeight:800, color:T.text, fontFamily:"Georgia,serif", marginBottom:4 }}>{load.origin} → {load.dest}</div>
            <div style={{ fontSize:12, color:T.muted, marginBottom:10 }}>{load.id} · {load.equipment} · ETA {load.drop}</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:6 }}>
              {[{l:"Rate",v:`$${load.rate.toLocaleString()}`},{l:"Miles",v:`${load.miles}`},{l:"Stops",v:"1"}].map(m=>(
                <div key={m.l} style={{ background:T.surface, borderRadius:7, padding:"7px 8px", textAlign:"center" }}>
                  <div style={{ fontSize:13, fontWeight:800, color:T.text }}>{m.v}</div>
                  <div style={{ fontSize:9, color:T.faint }}>{m.l}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background:T.card, borderRadius:12, padding:"14px", marginBottom:12 }}>
            <div style={{ fontSize:10, color:T.faint, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:8 }}>Hours of Service</div>
            {[{l:"Drive",pct:(drv.hos.drive/11)*100,v:`${drv.hos.drive.toFixed(1)}h left`},{l:"On-Duty",pct:(drv.hos.onDuty/14)*100,v:"4h left"}].map(h=>(
              <div key={h.l} style={{ marginBottom:8 }}>
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:4 }}>
                  <span style={{ color:T.muted }}>{h.l}</span>
                  <span style={{ color:T.amberText, fontWeight:700 }}>{h.v}</span>
                </div>
                <Progress pct={h.pct} color={T.amber} height={5} />
              </div>
            ))}
          </div>

          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            <Btn variant="primary" onClick={()=>setCheckin(!checkedIn)} fullWidth>
              <i className="ti ti-map-pin" aria-hidden /> {checkedIn?"✓ Checked In":"Send Check Call"}
            </Btn>
            {!podDone ? (
              <Btn variant="ghost" onClick={()=>setPod(true)} fullWidth>
                <i className="ti ti-camera" aria-hidden /> Upload Proof of Delivery
              </Btn>
            ) : (
              <Alert type="success" msg="POD uploaded and sent to shipper. Invoice will be generated automatically." />
            )}
            <Btn variant="ghost" fullWidth><i className="ti ti-phone" aria-hidden /> Call Shipper</Btn>
            <Btn variant="ghost" fullWidth><i className="ti ti-navigation" aria-hidden /> Open in Maps</Btn>
          </div>
        </div>}
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────
// ─── SECURITY & FRAUD PREVENTION DATA ───────────────────────────

const CARRIER_TRUST_SCORES = [
  { id:"carrier-001", name:"Stewart Trucking LLC", mc:"MC-847291", score:94, tier:"Elite", loadsCompleted:187, onTimeRate:97, eldGaps:0, routeDeviations:0, disputedDeliveries:0, quickPayFee:1.5, insuranceDaysLeft:201, cdlDaysLeft:312 },
  { id:"carrier-002", name:"Midwest Haulers LLC", mc:"MC-882201", score:31, tier:"Restricted", loadsCompleted:3, onTimeRate:67, eldGaps:4, routeDeviations:2, disputedDeliveries:1, quickPayFee:3.0, insuranceDaysLeft:12, cdlDaysLeft:45 },
  { id:"carrier-003", name:"Ohio Express LLC", mc:"MC-445521", score:72, tier:"Verified", loadsCompleted:42, onTimeRate:91, eldGaps:1, routeDeviations:0, disputedDeliveries:0, quickPayFee:2.5, insuranceDaysLeft:89, cdlDaysLeft:198 },
];

const FRAUD_FLAGS = [
  { id:"FF-001", loadId:"RL-4418", type:"ELD_GAP", severity:"HIGH", timestamp:"Today 02:14", description:"ELD signal lost for 47 minutes during active transit on Kansas City → LA run. Expected position: I-70 near Salina KS. No check-in response.", status:"UNDER_REVIEW", carrierId:"carrier-002" },
  { id:"FF-002", loadId:"RL-4415", type:"ROUTE_DEVIATION", severity:"MEDIUM", timestamp:"Yesterday 16:32", description:"Truck deviated 38 miles from expected I-71 route near Cincinnati. Deviation unannounced and unexplained. Driver resumed route after 22 minutes.", status:"RESOLVED", carrierId:"carrier-003" },
  { id:"FF-003", loadId:"RL-4413", type:"DRIVER_MISMATCH", severity:"HIGH", timestamp:"Today 08:45", description:"Driver check-in photo facial recognition mismatch with registered driver profile. Booked driver: Marcus Webb. Check-in shows different individual.", status:"ESCALATED", carrierId:"carrier-002" },
  { id:"FF-004", loadId:"RL-4416", type:"DOUBLE_BROKER_ATTEMPT", severity:"CRITICAL", timestamp:"Dec 14 11:20", description:"Carrier attempted to assign load to unregistered MC number MC-991234. Third-party MC not on platform. Load reassigned. Account flagged.", status:"RESOLVED", carrierId:"carrier-002" },
];

const INTRODUCED_RELATIONSHIPS = [
  { id:"IR-001", carrier:"Stewart Trucking LLC", carrierMC:"MC-847291", shipper:"Acme Freight Inc", shipperMC:"MC-229310", introDate:"Oct 15 2024", expiryDate:"Oct 15 2026", loadsOnPlatform:24, loadsOffPlatform:0, status:"COMPLIANT", value:"$41,280" },
  { id:"IR-002", carrier:"Ohio Express LLC", carrierMC:"MC-445521", shipper:"Global Cold Chain", shipperMC:"MC-441820", introDate:"Nov 01 2024", expiryDate:"Nov 01 2026", loadsOnPlatform:8, loadsOffPlatform:0, status:"COMPLIANT", value:"$18,920" },
  { id:"IR-003", carrier:"Midwest Haulers LLC", carrierMC:"MC-882201", shipper:"NorthEast Freight Co", shipperMC:"MC-774412", introDate:"Dec 01 2024", expiryDate:"Dec 01 2026", loadsOnPlatform:1, loadsOffPlatform:2, status:"VIOLATION_DETECTED", value:"$7,140 owed" },
];

const LOYALTY_TIERS = [
  { tier:"Founding Member", months:0, loads:0, quickPayFee:3.0, color:"#9a9485", icon:"ti-star", perks:["Free platform access","Direct founder support","Full feature access","Early feedback priority"] },
  { tier:"Verified Carrier", months:6, loads:10, quickPayFee:2.5, color:"#3498db", icon:"ti-shield-check", perks:["Reduced Quick Pay 2.5%","Priority load visibility","Early shipper access","Verified badge on profile"] },
  { tier:"Priority Carrier", months:12, loads:50, quickPayFee:2.0, color:"#e8a830", icon:"ti-crown", perks:["Reduced Quick Pay 2%","Grade A shipper exclusive access","Featured carrier status","Monthly lane intelligence report"] },
  { tier:"Elite Carrier", months:24, loads:150, quickPayFee:1.5, color:"#2ecc71", icon:"ti-award", perks:["Quick Pay at 1.5%","Dedicated account manager","First access to premium loads","Annual: one month free subscription"] },
];

const VERIFICATION_CHECKLIST = [
  { id:"V1", label:"FMCSA MC Authority Active", status:"PASS", detail:"MC-847291 · Authority Active · Last verified 2h ago via SAFER API", required:true },
  { id:"V2", label:"DOT Number Verified", status:"PASS", detail:"DOT-3841029 · Safety Rating: Satisfactory · No enforcement actions", required:true },
  { id:"V3", label:"Insurance Certificate on File", status:"PASS", detail:"$1M liability · $100K cargo · Carrier Priority named as certificate holder · Expires Aug 15 2025", required:true },
  { id:"V4", label:"EIN Business Verification", status:"PASS", detail:"EIN matched to registered business entity via Middesk · Priority Mile LLC confirmed", required:true },
  { id:"V5", label:"Bank Account Verified", status:"PASS", detail:"ACH account matches registered business name · Verified via Plaid · Account ending 4821", required:true },
  { id:"V6", label:"Phone Number Verified", status:"PASS", detail:"(614) 555-0100 · Non-VOIP confirmed via Twilio Verify · Registered to business address", required:true },
  { id:"V7", label:"Driver CDL Verification", status:"WARN", detail:"Marcus Webb CDL expires Mar 15 2026 · Rosa Delgado CDL expires Sep 30 2025 — 47 days · CDLIS cross-check complete", required:true },
  { id:"V8", label:"Vehicle VIN Registration", status:"PASS", detail:"3 vehicles registered · VINs cross-referenced against FMCSA vehicle database · All matched", required:true },
  { id:"V9", label:"Double Brokering Certification", status:"PASS", detail:"Digital certification signed Nov 15 2024 · Terms of Service v2.1 accepted · IP logged: 192.168.1.1", required:true },
  { id:"V10", label:"Introduced Relationship Agreement", status:"PASS", detail:"24-month introduced relationship terms accepted · 8% off-platform fee applies to all introduced connections", required:true },
];

// ─── TRUST SCORE MODULE ──────────────────────────────────────────
function TrustScorePanel() {
  const myScore = CARRIER_TRUST_SCORES[0];
  const currentTier = LOYALTY_TIERS[3];
  const nextTier = null;

  const ScoreRing = ({ score }) => {
    const color = score >= 80 ? T.green : score >= 60 ? T.amber : T.red;
    return (
      <div style={{ position:"relative", width:120, height:120, margin:"0 auto 16px" }}>
        <svg width={120} height={120} style={{ transform:"rotate(-90deg)" }}>
          <circle cx={60} cy={60} r={52} fill="none" stroke={T.border} strokeWidth={10} />
          <circle cx={60} cy={60} r={52} fill="none" stroke={color} strokeWidth={10}
            strokeDasharray={`${(score/100)*326.7} 326.7`} strokeLinecap="round" />
        </svg>
        <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}>
          <div style={{ fontSize:28, fontWeight:900, color, fontFamily:"Georgia,serif" }}>{score}</div>
          <div style={{ fontSize:9, color:T.muted, textTransform:"uppercase", letterSpacing:"0.06em" }}>Trust Score</div>
        </div>
      </div>
    );
  };

  return (
    <div>
      <SectionHeader icon="ti-shield-star" title="Carrier Trust Score & Loyalty" sub="Your platform reputation and loyalty tier — built load by load" />

      <div style={{ display:"grid", gridTemplateColumns:"300px 1fr", gap:20, marginBottom:24 }}>
        {/* Score card */}
        <div style={{ background:T.card, border:`0.5px solid ${T.border}`, borderRadius:12, padding:24, textAlign:"center" }}>
          <ScoreRing score={myScore.score} />
          <div style={{ fontSize:18, fontWeight:800, color:T.goldText, marginBottom:4 }}>{currentTier.tier}</div>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:6, marginBottom:16 }}>
            <i className={`ti ${currentTier.icon}`} style={{ color:currentTier.color, fontSize:16 }} />
            <span style={{ fontSize:12, color:T.muted }}>Highest loyalty tier</span>
          </div>
          <div style={{ background:T.greenBg, border:`0.5px solid ${T.green}`, borderRadius:8, padding:"8px 12px", marginBottom:12 }}>
            <div style={{ fontSize:11, color:T.greenText, fontWeight:700 }}>Quick Pay Fee: {myScore.quickPayFee}%</div>
            <div style={{ fontSize:10, color:T.muted }}>Elite tier discount applied</div>
          </div>
          <div style={{ fontSize:10, color:T.faint, lineHeight:1.6 }}>
            {myScore.loadsCompleted} loads completed · {myScore.onTimeRate}% on-time
          </div>
        </div>

        {/* Score factors */}
        <div style={{ background:T.card, border:`0.5px solid ${T.border}`, borderRadius:12, padding:20 }}>
          <div style={{ fontSize:13, fontWeight:700, color:T.text, marginBottom:16 }}>Score Factors</div>
          {[
            { label:"Loads Completed", value:myScore.loadsCompleted, max:200, positive:true, detail:"187 of 200 for max score" },
            { label:"On-Time Rate", value:myScore.onTimeRate, max:100, positive:true, detail:"97% on-time delivery" },
            { label:"ELD Signal Gaps", value:myScore.eldGaps, max:5, positive:false, detail:"0 gaps — perfect record" },
            { label:"Route Deviations", value:myScore.routeDeviations, max:3, positive:false, detail:"0 unauthorized deviations" },
            { label:"Disputed Deliveries", value:myScore.disputedDeliveries, max:3, positive:false, detail:"0 disputes — clean record" },
            { label:"Insurance Days Remaining", value:myScore.insuranceDaysLeft, max:365, positive:true, detail:`${myScore.insuranceDaysLeft} days until renewal` },
          ].map((f,i) => {
            const pct = Math.min(100, (f.value/f.max)*100);
            const barColor = f.positive ? (pct > 80 ? T.green : pct > 50 ? T.amber : T.red) : (f.value === 0 ? T.green : f.value < 2 ? T.amber : T.red);
            return (
              <div key={i} style={{ marginBottom:14 }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                  <span style={{ fontSize:12, color:T.muted }}>{f.label}</span>
                  <span style={{ fontSize:12, color:barColor, fontWeight:700 }}>{f.detail}</span>
                </div>
                <div style={{ height:5, background:T.border, borderRadius:99, overflow:"hidden" }}>
                  <div style={{ height:"100%", width:`${f.positive ? pct : Math.max(5, 100-(f.value/f.max)*100)}%`, background:barColor, borderRadius:99, transition:"width 0.6s ease" }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Loyalty tiers */}
      <div style={{ background:T.card, border:`0.5px solid ${T.border}`, borderRadius:12, padding:20, marginBottom:20 }}>
        <div style={{ fontSize:13, fontWeight:700, color:T.text, marginBottom:16 }}>Loyalty Tier Benefits</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12 }}>
          {LOYALTY_TIERS.map((tier,i) => {
            const isActive = tier.tier === currentTier.tier;
            return (
              <div key={i} style={{ background:isActive ? T.goldBg : T.surface, border:`${isActive ? 1.5 : 0.5}px solid ${isActive ? T.gold : T.border}`, borderRadius:10, padding:16, position:"relative" }}>
                {isActive && <div style={{ position:"absolute", top:-8, left:"50%", transform:"translateX(-50%)", background:T.gold, color:"#000", fontSize:8, fontWeight:900, padding:"2px 8px", borderRadius:99, whiteSpace:"nowrap" }}>YOUR TIER</div>}
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
                  <i className={`ti ${tier.icon}`} style={{ color:tier.color, fontSize:18 }} />
                  <div>
                    <div style={{ fontSize:11, fontWeight:800, color:isActive ? T.goldText : T.text }}>{tier.tier}</div>
                    <div style={{ fontSize:9, color:T.muted }}>Quick Pay: {tier.quickPayFee}%</div>
                  </div>
                </div>
                <div style={{ fontSize:9, color:T.faint, marginBottom:8 }}>{tier.months}mo · {tier.loads} loads</div>
                {tier.perks.map((p,j) => (
                  <div key={j} style={{ display:"flex", gap:5, marginBottom:4 }}>
                    <i className="ti ti-check" style={{ color:tier.color, fontSize:9, marginTop:2 }} />
                    <span style={{ fontSize:9, color:isActive ? T.muted : T.faint, lineHeight:1.4 }}>{p}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* Introduced relationships */}
      <div style={{ background:T.card, border:`0.5px solid ${T.border}`, borderRadius:12, padding:20 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
          <div style={{ fontSize:13, fontWeight:700, color:T.text }}>Introduced Relationships</div>
          <Pill label="24-Month Agreement" color={T.amberText} bg={T.amberBg} small />
        </div>
        <div style={{ fontSize:11, color:T.muted, marginBottom:14, lineHeight:1.6 }}>
          Carrier-shipper connections made through Carrier Priority are subject to an 8% Introduced Relationship Fee on transactions conducted outside the platform within 24 months of introduction. This protects the platform ecosystem and ensures fair value exchange.
        </div>
        {INTRODUCED_RELATIONSHIPS.map((ir,i) => (
          <div key={i} style={{ background:T.surface, border:`0.5px solid ${ir.status === "VIOLATION_DETECTED" ? T.red : T.border}`, borderRadius:8, padding:14, marginBottom:10 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
              <div>
                <div style={{ fontSize:12, fontWeight:700, color:T.text }}>{ir.carrier} ↔ {ir.shipper}</div>
                <div style={{ fontSize:10, color:T.muted }}>{ir.carrierMC} · {ir.shipperMC} · Introduced {ir.introDate}</div>
              </div>
              <Pill label={ir.status === "COMPLIANT" ? "Compliant" : "⚠ Violation"} color={ir.status === "COMPLIANT" ? T.greenText : T.redText} bg={ir.status === "COMPLIANT" ? T.greenBg : T.redBg} small />
            </div>
            <div style={{ display:"flex", gap:20 }}>
              <div style={{ fontSize:10, color:T.muted }}>On-Platform: <span style={{ color:T.greenText, fontWeight:700 }}>{ir.loadsOnPlatform} loads</span></div>
              <div style={{ fontSize:10, color:T.muted }}>Off-Platform: <span style={{ color:ir.loadsOffPlatform > 0 ? T.redText : T.greenText, fontWeight:700 }}>{ir.loadsOffPlatform} loads</span></div>
              <div style={{ fontSize:10, color:T.muted }}>Value: <span style={{ color:T.goldText, fontWeight:700 }}>{ir.value}</span></div>
              <div style={{ fontSize:10, color:T.muted }}>Expires: <span style={{ color:T.text }}>{ir.expiryDate}</span></div>
            </div>
            {ir.status === "VIOLATION_DETECTED" && (
              <div style={{ marginTop:10, background:T.redBg, border:`0.5px solid ${T.red}`, borderRadius:6, padding:"8px 12px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <span style={{ fontSize:11, color:T.redText }}>2 off-platform loads detected · 8% fee applies · {ir.value}</span>
                <Btn size="sm" style={{ background:T.red, color:"#fff", border:"none", fontSize:10, padding:"4px 10px" }}>Send Fee Invoice</Btn>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── FRAUD PREVENTION MODULE ─────────────────────────────────────
function FraudPrevention() {
  const [activeTab, setActiveTab] = useState("flags");
  const tabs = ["flags", "verification", "carriers"];

  return (
    <div>
      <SectionHeader icon="ti-shield-lock" title="Fraud Prevention & Security" sub="5-layer protection system preventing double brokering, identity fraud, and cargo theft" />

      {/* Security overview cards */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:24 }}>
        {[
          { label:"Fraud Flags Active", value:"3", color:T.redText, bg:T.redBg, icon:"ti-alert-triangle", sub:"1 critical, 2 high" },
          { label:"Carriers Verified", value:"3/3", color:T.greenText, bg:T.greenBg, icon:"ti-user-check", sub:"All layers passed" },
          { label:"Loads Monitored", value:"8", color:T.blueText, bg:T.blueBg, icon:"ti-eye", sub:"Real-time ELD tracking" },
          { label:"Bypasses Detected", value:"1", color:T.amberText, bg:T.amberBg, icon:"ti-alert-circle", sub:"IR violation logged" },
        ].map((s,i) => (
          <div key={i} style={{ background:s.bg, border:`0.5px solid ${s.color}`, borderRadius:10, padding:16 }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
              <span style={{ fontSize:10, color:s.color, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.05em" }}>{s.label}</span>
              <i className={`ti ${s.icon}`} style={{ color:s.color, fontSize:14 }} />
            </div>
            <div style={{ fontSize:24, fontWeight:900, color:s.color }}>{s.value}</div>
            <div style={{ fontSize:10, color:T.muted, marginTop:4 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Tab navigation */}
      <div style={{ display:"flex", gap:4, marginBottom:18 }}>
        {tabs.map(t => (
          <button key={t} onClick={() => setActiveTab(t)} style={{ padding:"7px 16px", borderRadius:7, border:"none", cursor:"pointer", fontSize:12, fontWeight:700, background:activeTab===t?T.gold:T.surface, color:activeTab===t?"#000":T.muted, textTransform:"capitalize" }}>
            {t === "flags" ? "🚨 Fraud Flags" : t === "verification" ? "✅ Verification" : "📊 Carrier Scores"}
          </button>
        ))}
      </div>

      {/* FRAUD FLAGS TAB */}
      {activeTab === "flags" && (
        <div>
          <div style={{ fontSize:12, color:T.muted, marginBottom:14 }}>All load anomalies, ELD gaps, driver mismatches, and double-brokering attempts are logged and investigated automatically.</div>
          {FRAUD_FLAGS.map((flag,i) => {
            const sevColor = flag.severity === "CRITICAL" ? T.red : flag.severity === "HIGH" ? T.amber : T.blue;
            const sevBg = flag.severity === "CRITICAL" ? T.redBg : flag.severity === "HIGH" ? T.amberBg : T.blueBg;
            return (
              <div key={i} style={{ background:T.card, border:`0.5px solid ${sevColor}`, borderRadius:10, padding:16, marginBottom:12 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
                  <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                    <div style={{ background:sevBg, border:`0.5px solid ${sevColor}`, borderRadius:6, padding:"3px 8px" }}>
                      <span style={{ fontSize:9, fontWeight:800, color:sevColor, textTransform:"uppercase", letterSpacing:"0.06em" }}>{flag.severity}</span>
                    </div>
                    <div style={{ fontSize:12, fontWeight:700, color:T.text }}>{flag.type.replace(/_/g," ")}</div>
                    <div style={{ fontSize:10, color:T.muted }}>{flag.loadId} · {flag.timestamp}</div>
                  </div>
                  <Pill label={flag.status.replace(/_/g," ")} color={flag.status==="RESOLVED"?T.greenText:flag.status==="ESCALATED"?T.redText:T.amberText} bg={flag.status==="RESOLVED"?T.greenBg:flag.status==="ESCALATED"?T.redBg:T.amberBg} small />
                </div>
                <div style={{ fontSize:11, color:T.muted, lineHeight:1.6, marginBottom:10 }}>{flag.description}</div>
                {flag.status !== "RESOLVED" && (
                  <div style={{ display:"flex", gap:8 }}>
                    <Btn size="sm" style={{ background:T.red, color:"#fff", border:"none", fontSize:10 }}>Suspend Carrier</Btn>
                    <Btn size="sm" style={{ background:T.amberBg, color:T.amberText, border:`0.5px solid ${T.amber}`, fontSize:10 }}>Hold Payment</Btn>
                    <Btn size="sm" style={{ background:T.surface, color:T.muted, border:`0.5px solid ${T.border}`, fontSize:10 }}>Mark Resolved</Btn>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* VERIFICATION TAB */}
      {activeTab === "verification" && (
        <div>
          <div style={{ background:T.card, border:`0.5px solid ${T.border}`, borderRadius:12, padding:20, marginBottom:20 }}>
            <div style={{ fontSize:13, fontWeight:700, color:T.text, marginBottom:4 }}>5-Layer Verification System</div>
            <div style={{ fontSize:11, color:T.muted, marginBottom:16 }}>Every carrier on Carrier Priority passes all five layers before they can book a single load. Each layer catches what the previous layer misses.</div>
            {[
              { layer:"Layer 1", title:"Identity Verification at Registration", items:["FMCSA SAFER API — MC and DOT verified against government database","EIN matched to legal business entity via Middesk","Bank account matched to business name via Plaid","Phone number verified as non-VOIP via Twilio Verify","Insurance certificate uploaded naming Carrier Priority as certificate holder"] },
              { layer:"Layer 2", title:"Driver Verification at Load Acceptance", items:["Named driver required for every load booking","CDL number and expiration verified via CDLIS federal database","Medical card expiration confirmed current at time of booking","Driver photo on file in Document Hub","Driver paired to registered ELD device before load acceptance"] },
              { layer:"Layer 3", title:"Equipment Verification at Dispatch", items:["VIN registered and cross-referenced against FMCSA vehicle database","License plate logged for every dispatched load","ELD device matched to registered VIN","Driver photo uploaded from pickup location — geotagged and timestamped","Equipment type confirmed matches load requirements"] },
              { layer:"Layer 4", title:"Real-Time Monitoring During Transit", items:["ELD signal continuity — alert if dark for more than 30 minutes","Route deviation detection — alert if more than 25 miles off expected route","Driver app check-in every 4 hours — biometric or PIN confirmation","Speed and behavior monitoring via ELD data","MC number lock — no second carrier can interact with load documentation"] },
              { layer:"Layer 5", title:"Delivery Verification and Payment Gate", items:["Geotagged POD — photo must be taken within 500 meters of delivery address","GPS coordinates embedded in photo metadata and verified","Receiver digital signature required on loads above $2,000","2-hour payment review window for system flag check","Shipper 4-hour dispute window before payment release"] },
            ].map((l,i) => (
              <div key={i} style={{ background:T.surface, border:`0.5px solid ${T.border}`, borderRadius:8, padding:14, marginBottom:10 }}>
                <div style={{ display:"flex", gap:10, alignItems:"center", marginBottom:10 }}>
                  <div style={{ background:T.goldBg, border:`0.5px solid ${T.gold}`, borderRadius:6, padding:"3px 10px" }}>
                    <span style={{ fontSize:10, fontWeight:800, color:T.goldText }}>{l.layer}</span>
                  </div>
                  <div style={{ fontSize:12, fontWeight:700, color:T.text }}>{l.title}</div>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"4px 16px" }}>
                  {l.items.map((item,j) => (
                    <div key={j} style={{ display:"flex", gap:6, alignItems:"flex-start" }}>
                      <i className="ti ti-shield-check" style={{ color:T.green, fontSize:10, marginTop:2, flexShrink:0 }} />
                      <span style={{ fontSize:10, color:T.muted, lineHeight:1.5 }}>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Current carrier verification status */}
          <div style={{ background:T.card, border:`0.5px solid ${T.border}`, borderRadius:12, padding:20 }}>
            <div style={{ fontSize:13, fontWeight:700, color:T.text, marginBottom:14 }}>Your Verification Status — Stewart Trucking LLC</div>
            {VERIFICATION_CHECKLIST.map((v,i) => (
              <div key={i} style={{ display:"flex", gap:12, alignItems:"flex-start", padding:"10px 0", borderBottom:`0.5px solid ${T.border}` }}>
                <div style={{ width:20, height:20, borderRadius:"50%", background:v.status==="PASS"?T.greenBg:T.amberBg, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                  <i className={`ti ti-${v.status==="PASS"?"check":"alert-triangle"}`} style={{ color:v.status==="PASS"?T.green:T.amber, fontSize:10 }} />
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:12, fontWeight:700, color:T.text, marginBottom:2 }}>{v.label}</div>
                  <div style={{ fontSize:10, color:T.muted }}>{v.detail}</div>
                </div>
                <Pill label={v.status} color={v.status==="PASS"?T.greenText:T.amberText} bg={v.status==="PASS"?T.greenBg:T.amberBg} small />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CARRIER SCORES TAB */}
      {activeTab === "carriers" && (
        <div>
          <div style={{ fontSize:12, color:T.muted, marginBottom:14 }}>Carrier Trust Scores are composite ratings built from completed loads, ELD data, on-time performance, and shipper feedback. Scores determine Quick Pay fee rates and access to Grade A shippers.</div>
          {CARRIER_TRUST_SCORES.map((c,i) => {
            const scoreColor = c.score >= 80 ? T.green : c.score >= 60 ? T.amber : T.red;
            const scoreBg = c.score >= 80 ? T.greenBg : c.score >= 60 ? T.amberBg : T.redBg;
            return (
              <div key={i} style={{ background:T.card, border:`0.5px solid ${scoreColor}`, borderRadius:10, padding:16, marginBottom:12 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:800, color:T.text }}>{c.name}</div>
                    <div style={{ fontSize:10, color:T.muted }}>{c.mc} · {c.loadsCompleted} loads completed</div>
                  </div>
                  <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                    <div style={{ background:scoreBg, border:`0.5px solid ${scoreColor}`, borderRadius:8, padding:"6px 14px", textAlign:"center" }}>
                      <div style={{ fontSize:22, fontWeight:900, color:scoreColor, fontFamily:"Georgia,serif" }}>{c.score}</div>
                      <div style={{ fontSize:8, color:T.muted, textTransform:"uppercase", letterSpacing:"0.06em" }}>Trust Score</div>
                    </div>
                    <Pill label={c.tier} color={c.score>=80?T.greenText:c.score>=60?T.amberText:T.redText} bg={c.score>=80?T.greenBg:c.score>=60?T.amberBg:T.redBg} small />
                  </div>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:8 }}>
                  {[
                    { label:"On-Time", value:`${c.onTimeRate}%`, good:c.onTimeRate>=90 },
                    { label:"ELD Gaps", value:c.eldGaps, good:c.eldGaps===0 },
                    { label:"Deviations", value:c.routeDeviations, good:c.routeDeviations===0 },
                    { label:"Disputes", value:c.disputedDeliveries, good:c.disputedDeliveries===0 },
                    { label:"Quick Pay Fee", value:`${c.quickPayFee}%`, good:c.quickPayFee<=2 },
                  ].map((m,j) => (
                    <div key={j} style={{ background:T.surface, borderRadius:6, padding:"8px 10px", textAlign:"center" }}>
                      <div style={{ fontSize:14, fontWeight:800, color:m.good?T.greenText:T.redText }}>{m.value}</div>
                      <div style={{ fontSize:9, color:T.muted }}>{m.label}</div>
                    </div>
                  ))}
                </div>
                {c.score < 40 && (
                  <div style={{ marginTop:12, background:T.redBg, border:`0.5px solid ${T.red}`, borderRadius:6, padding:"8px 12px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <span style={{ fontSize:11, color:T.redText }}>⚠ Score below 40 — account restricted to verified shippers only. Manual review required before load booking.</span>
                    <Btn size="sm" style={{ background:T.red, color:"#fff", border:"none", fontSize:10 }}>Review Account</Btn>
                  </div>
                )}
              </div>
            );
          })}

          {/* Score threshold guide */}
          <div style={{ background:T.card, border:`0.5px solid ${T.border}`, borderRadius:10, padding:16 }}>
            <div style={{ fontSize:12, fontWeight:700, color:T.text, marginBottom:12 }}>Trust Score Thresholds</div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10 }}>
              {[
                { range:"80-100", label:"Full Access", desc:"All shippers, expedited Quick Pay, Grade A exclusive access", color:T.green, bg:T.greenBg },
                { range:"60-79", label:"Standard Access", desc:"Standard platform access, standard Quick Pay timeline", color:T.amber, bg:T.amberBg },
                { range:"40-59", label:"Restricted", desc:"Verified shippers only, manual review before load acceptance", color:T.blue, bg:T.blueBg },
                { range:"0-39", label:"Suspended", desc:"Account suspended pending review, no load booking permitted", color:T.red, bg:T.redBg },
              ].map((t,i) => (
                <div key={i} style={{ background:t.bg, border:`0.5px solid ${t.color}`, borderRadius:8, padding:12 }}>
                  <div style={{ fontSize:18, fontWeight:900, color:t.color, fontFamily:"Georgia,serif", marginBottom:4 }}>{t.range}</div>
                  <div style={{ fontSize:11, fontWeight:700, color:t.color, marginBottom:4 }}>{t.label}</div>
                  <div style={{ fontSize:9, color:T.muted, lineHeight:1.5 }}>{t.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const NAV = [
  { id:"board",      icon:"ti-layout-list",   label:"Load Board",   badge:null },
  { id:"tracking",   icon:"ti-navigation",     label:"Tracking",     badge:"2" },
  { id:"documents",  icon:"ti-files",          label:"Documents",    badge:"3" },
  { id:"payments",   icon:"ti-receipt-2",      label:"Payments",     badge:"$" },
  { id:"drivers",    icon:"ti-user-bolt",      label:"Drivers",      badge:null },
  { id:"fleet",      icon:"ti-truck",          label:"Fleet",        badge:null },
  { id:"compliance", icon:"ti-shield-check",   label:"Compliance",   badge:"2" },
  { id:"analytics",  icon:"ti-chart-bar",      label:"Analytics",    badge:null },
  { id:"shipper",    icon:"ti-building-store", label:"Shipper Portal",badge:null },
  { id:"trust",      icon:"ti-shield-star",    label:"Trust Score",  badge:null },
  { id:"fraud",      icon:"ti-shield-lock",    label:"Fraud Guard",  badge:"3" },
  { id:"mobile",     icon:"ti-device-mobile",  label:"Driver App",   badge:null },
  { id:"settings",   icon:"ti-settings",       label:"Settings",     badge:null },
];

const GLOBAL_STATS = [
  { label:"Revenue MTD", value:"$41,280", delta:"+18%", up:true, icon:"ti-coin" },
  { label:"Net Profit MTD", value:"$17,140", delta:"+22%", up:true, icon:"ti-trending-up" },
  { label:"Active Loads", value:"3", delta:"2 in transit", up:null, icon:"ti-truck" },
  { label:"Pending Invoices", value:"$4,618", delta:"2 awaiting", up:null, icon:"ti-receipt" },
];

export default function App() {
  const [authed, setAuthed] = useState(false);
  const [tab, setTab] = useState("board");
  const [notifOpen, setNotifOpen] = useState(false);
  const [alertBar, setAlertBar] = useState(true);

  if (!authed) return <AuthScreen onLogin={()=>setAuthed(true)} />;

  const PAGES = { board:<LoadBoard/>, tracking:<Tracking/>, documents:<Documents/>, payments:<Payments/>, drivers:<Drivers/>, fleet:<Fleet/>, compliance:<Compliance/>, analytics:<Analytics/>, shipper:<ShipperPortal/>, trust:<TrustScorePanel/>, fraud:<FraudPrevention/>, mobile:<MobileDriver/>, settings:<SettingsPanel/> };

  const NOTIFS = [
    { type:"warn", msg:"FRAUD FLAG: Driver mismatch detected on RL-4413 — review required" },
    { type:"warn", msg:"Liability insurance expires Jan 15 — 32 days" },
    { type:"warn", msg:"IRP & IFTA renewal due Dec 31 — 17 days" },
    { type:"info", msg:"IR Violation: Midwest Haulers booked 2 loads off-platform — $7,140 fee invoice sent" },
    { type:"info", msg:"New matching load: Indy→Boston $2,433 · Score 74" },
    { type:"success", msg:"Invoice INV-2041 paid — $2,344 ACH confirmed · Quick Pay 1.5% Elite tier" },
  ];

  return (
    <div style={{ background:T.bg, minHeight:"100vh", fontFamily:"'Georgia', serif", display:"flex", flexDirection:"column" }}>
      <h2 className="sr-only">CARRIER PRIORITY full-stack freight management platform</h2>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js" />

      {/* Top Nav */}
      <div style={{ background:T.surface, borderBottom:`0.5px solid ${T.border}`, height:52, display:"flex", alignItems:"center", padding:"0 24px", gap:16, flexShrink:0 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:30, height:30, background:T.gold, borderRadius:7, display:"flex", alignItems:"center", justifyContent:"center" }}>
            <i className="ti ti-truck" style={{ fontSize:15, color:"#000" }} aria-hidden />
          </div>
          <div style={{ fontSize:16, fontWeight:900, color:T.text, letterSpacing:"-0.03em" }}>Carrier Priority</div>
          <Pill label="Pro · Fleet" color={T.goldText} bg={T.goldBg} small />
        </div>
        <div style={{ flex:1 }} />
        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          <div style={{ width:7, height:7, borderRadius:"50%", background:T.green }} />
          <span style={{ fontSize:12, color:T.muted, fontFamily:"system-ui" }}>{ME.name}</span>
        </div>
        <div style={{ position:"relative" }}>
          <button onClick={()=>setNotifOpen(!notifOpen)} style={{ background:"none", border:"none", cursor:"pointer", color:T.muted, fontSize:18, padding:4, display:"flex" }}>
            <i className="ti ti-bell" aria-label="notifications" />
          </button>
          <span style={{ position:"absolute", top:-2, right:-2, width:16, height:16, borderRadius:"50%", background:T.red, fontSize:9, color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontFamily:"system-ui" }}>6</span>
        </div>
        <div style={{ width:30, height:30, borderRadius:"50%", background:T.goldBg, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:800, color:T.goldText }}>ST</div>
      </div>

      {notifOpen&&(
        <div style={{ position:"absolute", top:56, right:24, zIndex:999, background:T.card, border:`0.5px solid ${T.border}`, borderRadius:12, width:340, padding:"12px 0" }}>
          <div style={{ padding:"4px 16px 10px", fontSize:13, fontWeight:700, color:T.text, borderBottom:`0.5px solid ${T.border}`, marginBottom:6, fontFamily:"Georgia,serif" }}>Notifications</div>
          {NOTIFS.map((n,i)=>(
            <div key={i} style={{ display:"flex", gap:10, padding:"9px 16px", alignItems:"flex-start" }}>
              <i className={`ti ti-${n.type==="warn"?"alert-triangle":n.type==="success"?"circle-check":"info-circle"}`} style={{ fontSize:14, color:n.type==="warn"?T.amberText:n.type==="success"?T.greenText:T.blueText, marginTop:1, flexShrink:0 }} aria-hidden />
              <span style={{ fontSize:12, color:T.muted, lineHeight:1.5, fontFamily:"system-ui" }}>{n.msg}</span>
            </div>
          ))}
          <div style={{ padding:"8px 16px 0", borderTop:`0.5px solid ${T.border}`, marginTop:6 }}>
            <button onClick={()=>setNotifOpen(false)} style={{ fontSize:12, color:T.gold, background:"none", border:"none", cursor:"pointer", fontWeight:700 }}>Dismiss all</button>
          </div>
        </div>
      )}

      <div style={{ display:"flex", flex:1, overflow:"hidden" }}>
        {/* Sidebar */}
        <div style={{ width:192, background:T.surface, borderRight:`0.5px solid ${T.border}`, display:"flex", flexDirection:"column", flexShrink:0 }}>
          <div style={{ padding:"14px 10px", flex:1, overflowY:"auto" }}>
            {NAV.map(n=>(
              <button key={n.id} onClick={()=>{ setTab(n.id); setNotifOpen(false); }} style={{
                display:"flex", alignItems:"center", gap:9, padding:"9px 12px", borderRadius:8,
                border:"none", cursor:"pointer", width:"100%", textAlign:"left", marginBottom:2,
                background:tab===n.id?T.goldBg:"transparent",
                color:tab===n.id?T.goldText:T.muted, fontWeight:tab===n.id?700:400, fontSize:13,
                fontFamily:"system-ui"
              }}>
                <i className={`ti ${n.icon}`} style={{ fontSize:15, flexShrink:0 }} aria-hidden />
                <span style={{ flex:1 }}>{n.label}</span>
                {n.badge&&<span style={{ fontSize:9, fontWeight:900, color:T.goldText, background:T.goldBg, padding:"1px 5px", borderRadius:99 }}>{n.badge}</span>}
              </button>
            ))}
          </div>
          <div style={{ padding:"12px 14px", borderTop:`0.5px solid ${T.border}` }}>
            <div style={{ fontSize:10, color:T.faint, fontFamily:"system-ui", lineHeight:1.6 }}>
              {ME.mc} · {ME.dot}<br />
              <span style={{ color:T.greenText }}>● FMCSA Compliant</span>
            </div>
          </div>
        </div>

        {/* Main content */}
        <div style={{ flex:1, overflowY:"auto", padding:"22px 28px" }}>
          {alertBar&&<Alert type="warn" msg="🚨 FRAUD ALERT: Driver mismatch on RL-4413 · IR Violation detected: Midwest Haulers — $7,140 fee invoice issued · Insurance expires Jan 15 · IRP/IFTA renewal due Dec 31" onDismiss={()=>setAlertBar(false)} />}

          {/* Global stats */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:22 }}>
            {GLOBAL_STATS.map(s=>(
              <div key={s.label} style={{ background:T.card, border:`0.5px solid ${T.border}`, borderRadius:10, padding:"14px 16px" }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
                  <span style={{ fontSize:10, color:T.muted, fontWeight:600, letterSpacing:"0.05em", textTransform:"uppercase", fontFamily:"system-ui" }}>{s.label}</span>
                  <i className={`ti ${s.icon}`} style={{ fontSize:15, color:T.muted }} aria-hidden />
                </div>
                <div style={{ fontSize:24, fontWeight:900, color:T.text, letterSpacing:"-0.02em", marginBottom:5 }}>{s.value}</div>
                {s.up!==null ? (
                  <div style={{ fontSize:11, color:s.up?T.greenText:T.redText, fontWeight:700, fontFamily:"system-ui" }}>
                    <i className={`ti ti-arrow-${s.up?"up":"down"}-right`} style={{fontSize:11}} aria-hidden /> {s.delta}
                  </div>
                ) : <div style={{ fontSize:11, color:T.gold, fontFamily:"system-ui" }}>{s.delta}</div>}
              </div>
            ))}
          </div>

          {/* Page content */}
          <div style={{ fontFamily:"system-ui" }}>
            {PAGES[tab]}
          </div>
        </div>
      </div>
    </div>
  );
}
