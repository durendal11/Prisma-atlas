import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';
import type { Alert } from '@/types';
import type { HealthSummary, FarrowingLikelihood } from '@/services/behaviorLogger';

interface ReportHeaderOptions {
  title: string;
  subtitle?: string;
  dateRange?: string;
  farmName?: string;
}

// ── Common PDF Branded Header & Footer ──────────────────────────────────────
const addReportHeader = (doc: jsPDF, options: ReportHeaderOptions) => {
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Header Banner
  doc.setFillColor(30, 41, 59); // Slate-800
  doc.rect(0, 0, pageWidth, 28, 'F');
  
  // Brand Title
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('PRISMA ATLAS', 14, 14);
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('AI Farm Watch & Swine Health Intelligence', 14, 21);
  
  // Report Title (Right Aligned)
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(options.title, pageWidth - 14, 14, { align: 'right' });
  
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  const metaText = `Generated: ${new Date().toLocaleString()} ${options.dateRange ? `| Period: ${options.dateRange}` : ''}`;
  doc.text(metaText, pageWidth - 14, 21, { align: 'right' });

  // Accent Bar
  doc.setFillColor(37, 99, 235); // Blue-600
  doc.rect(0, 28, pageWidth, 2, 'F');
};

const addReportFooter = (doc: jsPDF) => {
  const pageCount = (doc as any).internal.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(226, 232, 240);
    doc.line(14, pageHeight - 14, pageWidth - 14, pageHeight - 14);
    
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'normal');
    doc.text('Confidential - Prisma Atlas AI Farm Watch System Report', 14, pageHeight - 8);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - 14, pageHeight - 8, { align: 'right' });
  }
};

// ── Metric Card Renderer ────────────────────────────────────────────────────
interface MetricCard {
  label: string;
  value: string | number;
  subtext?: string;
  color?: [number, number, number];
}

const drawMetricCards = (doc: jsPDF, startY: number, cards: MetricCard[]) => {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const gap = 8;
  const availableWidth = pageWidth - (margin * 2) - (gap * (cards.length - 1));
  const cardWidth = availableWidth / cards.length;
  const cardHeight = 22;

  cards.forEach((card, index) => {
    const x = margin + (index * (cardWidth + gap));
    
    // Background
    doc.setFillColor(248, 250, 252); // Slate-50
    doc.setDrawColor(226, 232, 240); // Slate-200
    doc.roundedRect(x, startY, cardWidth, cardHeight, 3, 3, 'FD');
    
    // Colored top border accent
    const accentColor = card.color || [37, 99, 235];
    doc.setFillColor(accentColor[0], accentColor[1], accentColor[2]);
    doc.rect(x + 3, startY, cardWidth - 6, 2, 'F');

    // Label
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(card.label.toUpperCase(), x + 6, startY + 8);

    // Value
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(String(card.value), x + 6, startY + 16);

    if (card.subtext) {
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(148, 163, 184);
      doc.text(card.subtext, x + cardWidth - 6, startY + 16, { align: 'right' });
    }
  });

  return startY + cardHeight + 8;
};

// ────────────────────────────────────────────────────────────────────────────
// 1. STATS / FARM EXECUTIVE REPORT
// ────────────────────────────────────────────────────────────────────────────
export interface FarmStatsReportData {
  stats?: {
    active_sows?: number;
    active_piglets?: number;
    active_alerts?: number;
    pens_monitored?: number;
  };
  healthSummary?: HealthSummary | null;
  cleaningSchedule?: Array<{
    pen_id: number;
    pen_name: string;
    cleanliness_score: number;
    wetness_score: number;
    status: string;
    last_cleaned_at?: string | null;
  }>;
  farrowingLikelihood?: FarrowingLikelihood | null;
}

export const generateStatsReportPDF = async (
  data: FarmStatsReportData,
  elementToCaptureId?: string
) => {
  const doc = new jsPDF('p', 'mm', 'a4');
  
  addReportHeader(doc, {
    title: 'FARM EXECUTIVE REPORT',
    dateRange: 'Current Snapshot',
  });

  let currentY = 36;

  // Key KPI Cards
  const cards: MetricCard[] = [
    { label: 'Active Sows', value: data.stats?.active_sows ?? 0, color: [37, 99, 235] },
    { label: 'Active Piglets', value: data.stats?.active_piglets ?? 0, color: [16, 185, 129] },
    { label: 'Pens Monitored', value: data.stats?.pens_monitored ?? 0, color: [139, 92, 246] },
    { label: 'Active Alerts', value: data.stats?.active_alerts ?? 0, color: (data.stats?.active_alerts ?? 0) > 0 ? [239, 68, 68] : [16, 185, 129] },
  ];

  currentY = drawMetricCards(doc, currentY, cards);

  // Capture Recharts graphics if element provided
  if (elementToCaptureId) {
    const el = document.getElementById(elementToCaptureId);
    if (el) {
      try {
        const canvas = await html2canvas(el, { scale: 2, useCORS: true });
        const imgData = canvas.toDataURL('image/png');
        const imgWidth = doc.internal.pageSize.getWidth() - 28;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 41, 59);
        doc.text('Behavior & Health Trend Visualizations', 14, currentY);
        currentY += 4;
        
        doc.addImage(imgData, 'PNG', 14, currentY, imgWidth, Math.min(imgHeight, 60));
        currentY += Math.min(imgHeight, 60) + 8;
      } catch (err) {
        console.warn('Failed to capture charts canvas for PDF', err);
      }
    }
  }

  // Health Summary Section
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text('Farm Health & Posture Risk Summary (Past 24h)', 14, currentY);
  currentY += 4;

  const totalPens = data.healthSummary?.total_pens ?? 0;
  const needingAttn = data.healthSummary?.pens_needing_attention ?? 0;

  autoTable(doc, {
    startY: currentY,
    head: [['Pen Health Overview', 'Metric Value', 'Status Assessment']],
    body: [
      ['Total Pens Monitored (24h)', String(totalPens), 'Active Monitoring'],
      ['Pens Needing Attention', String(needingAttn), needingAttn > 0 ? 'ATTENTION REQUIRED' : 'All Clear'],
      ['Farrowing Likelihood Score', data.farrowingLikelihood ? `${data.farrowingLikelihood.score}% (${data.farrowingLikelihood.likelihood})` : 'N/A', 'AI Forecast'],
    ],
    headStyles: { fillColor: [30, 41, 59] },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 14, right: 14 },
  });

  currentY = (doc as any).lastAutoTable.finalY + 10;

  // Hygiene & Cleaning Schedule Table
  if (data.cleaningSchedule && data.cleaningSchedule.length > 0) {
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text('Pen Hygiene & Cleaning Schedule Status', 14, currentY);
    currentY += 4;

    const cleaningRows = data.cleaningSchedule.map(item => [
      item.pen_name || `Pen #${item.pen_id}`,
      `${item.cleanliness_score ?? 0}%`,
      `${item.wetness_score ?? 0}%`,
      item.last_cleaned_at ? new Date(item.last_cleaned_at).toLocaleDateString() : 'N/A',
      item.status.toUpperCase(),
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [['Pen Name', 'Cleanliness', 'Wetness Score', 'Last Cleaned', 'Hygiene Status']],
      body: cleaningRows,
      headStyles: { fillColor: [37, 99, 235] },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: 14, right: 14 },
    });
  }

  addReportFooter(doc);
  doc.save(`PrismaAtlas_FarmExecutiveReport_${new Date().toISOString().slice(0, 10)}.pdf`);
};

// ────────────────────────────────────────────────────────────────────────────
// 2. FARROWING CLINICAL & DELIVERY REPORT
// ────────────────────────────────────────────────────────────────────────────
export interface FarrowingReportData {
  records: Array<{
    id: number;
    sow_id: number;
    pen_id?: number | null;
    farrowing_started?: string | null;
    farrowing_completed?: string | null;
    total_born?: number | null;
    born_alive?: number | null;
    stillborn?: number | null;
    sow_condition?: string | null;
  }>;
  dueSows?: Array<{
    tag_id: string;
    pen_id?: number | null;
    expected_date?: string | null;
    urgency: string;
    farrowing_window?: string | null;
  }>;
  stats?: {
    total_farrowed?: number;
    total_born_alive?: number;
    avg_litter_size?: number;
    survival_rate?: number;
  };
}

export const generateFarrowingReportPDF = (data: FarrowingReportData) => {
  const doc = new jsPDF('p', 'mm', 'a4');

  addReportHeader(doc, {
    title: 'FARROWING DELIVERY REPORT',
    dateRange: 'Recent Sessions & Forecast',
  });

  let currentY = 36;

  // Metric Cards
  const cards: MetricCard[] = [
    { label: 'Completed Deliveries', value: data.stats?.total_farrowed ?? data.records.length, color: [37, 99, 235] },
    { label: 'Total Born Alive', value: data.stats?.total_born_alive ?? data.records.reduce((acc, r) => acc + (r.born_alive || 0), 0), color: [16, 185, 129] },
    { label: 'Avg Litter Size', value: data.stats?.avg_litter_size ?? (data.records.length > 0 ? (data.records.reduce((acc, r) => acc + (r.total_born || 0), 0) / data.records.length).toFixed(1) : 'N/A'), color: [139, 92, 246] },
    { label: 'Sows Due (Next 7d)', value: data.dueSows?.length ?? 0, color: [245, 158, 11] },
  ];

  currentY = drawMetricCards(doc, currentY, cards);

  // Farrowing Delivery Logs Table
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text('Farrowing Delivery Log History', 14, currentY);
  currentY += 4;

  const deliveryRows = data.records.map(record => [
    `Sow #${record.sow_id}`,
    record.pen_id ? `Pen #${record.pen_id}` : 'N/A',
    record.farrowing_started ? new Date(record.farrowing_started).toLocaleString() : 'In Progress',
    String(record.total_born ?? 0),
    String(record.born_alive ?? 0),
    String(record.stillborn ?? 0),
    record.sow_condition || 'Normal',
  ]);

  autoTable(doc, {
    startY: currentY,
    head: [['Sow Tag', 'Pen', 'Farrowing Started', 'Total Born', 'Born Alive', 'Stillborn', 'Sow Condition']],
    body: deliveryRows.length > 0 ? deliveryRows : [['No delivery records found.', '-', '-', '-', '-', '-', '-']],
    headStyles: { fillColor: [30, 41, 59] },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 14, right: 14 },
  });

  currentY = (doc as any).lastAutoTable.finalY + 10;

  // Upcoming Due Sows Watchlist Table
  if (data.dueSows && data.dueSows.length > 0) {
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text('Upcoming Farrowing Watchlist (Expected Sows)', 14, currentY);
    currentY += 4;

    const dueRows = data.dueSows.map(sow => [
      sow.tag_id,
      sow.pen_id ? `Pen #${sow.pen_id}` : 'N/A',
      sow.expected_date ? new Date(sow.expected_date).toLocaleDateString() : 'Pending',
      sow.farrowing_window?.replace('_', ' ').toUpperCase() || 'UPCOMING',
      sow.urgency.toUpperCase(),
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [['Sow Tag ID', 'Assigned Pen', 'Expected Date', 'Farrowing Window', 'Urgency Tier']],
      body: dueRows,
      headStyles: { fillColor: [37, 99, 235] },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: 14, right: 14 },
    });
  }

  addReportFooter(doc);
  doc.save(`PrismaAtlas_FarrowingReport_${new Date().toISOString().slice(0, 10)}.pdf`);
};

// ────────────────────────────────────────────────────────────────────────────
// 3. INDIVIDUAL SOW PASSPORT / HEALTH RECORD
// ────────────────────────────────────────────────────────────────────────────
export interface SowPassportData {
  sow: {
    id: number;
    tag_id: string;
    name?: string | null;
    breed?: string | null;
    parity?: number;
    status?: string | null;
    pen_id?: number | null;
    birth_date?: string | null;
  };
  farrowingHistory?: Array<{
    farrowing_started?: string | null;
    total_born?: number | null;
    born_alive?: number | null;
    stillborn?: number | null;
  }>;
  alertsHistory?: Array<Alert>;
}

export const generateSowPassportPDF = (data: SowPassportData) => {
  const doc = new jsPDF('p', 'mm', 'a4');
  const sow = data.sow;

  addReportHeader(doc, {
    title: `SOW HEALTH PASSPORT - ${sow.tag_id}`,
    subtitle: sow.name ? `Name: ${sow.name}` : undefined,
  });

  let currentY = 36;

  // Individual Sow Metrics
  const cards: MetricCard[] = [
    { label: 'Tag ID / Ref', value: sow.tag_id, color: [37, 99, 235] },
    { label: 'Parity / Litter #', value: sow.parity ?? 1, color: [139, 92, 246] },
    { label: 'Assigned Pen', value: sow.pen_id ? `Pen #${sow.pen_id}` : 'Unassigned', color: [16, 185, 129] },
    { label: 'Current Status', value: (sow.status || 'Active').toUpperCase(), color: [30, 41, 59] },
  ];

  currentY = drawMetricCards(doc, currentY, cards);

  // Overview Table
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text('Biological & Breed Overview', 14, currentY);
  currentY += 4;

  autoTable(doc, {
    startY: currentY,
    head: [['Attribute', 'Value', 'Attribute', 'Value']],
    body: [
      ['Tag Identifier', sow.tag_id, 'Breed / Genetics', sow.breed || 'Standard Commercial'],
      ['Name / Alias', sow.name || 'N/A', 'Birth Date / Age', sow.birth_date ? new Date(sow.birth_date).toLocaleDateString() : 'N/A'],
      ['Parity Count', String(sow.parity ?? 1), 'System Status', sow.status || 'Active'],
    ],
    headStyles: { fillColor: [30, 41, 59] },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 14, right: 14 },
  });

  currentY = (doc as any).lastAutoTable.finalY + 10;

  // Farrowing History Table
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text('Farrowing & Litter Record History', 14, currentY);
  currentY += 4;

  const farrowingRows = (data.farrowingHistory || []).map((item, index) => [
    `Parity #${index + 1}`,
    item.farrowing_started ? new Date(item.farrowing_started).toLocaleDateString() : 'N/A',
    String(item.total_born ?? 0),
    String(item.born_alive ?? 0),
    String(item.stillborn ?? 0),
  ]);

  autoTable(doc, {
    startY: currentY,
    head: [['Parity #', 'Farrowing Date', 'Total Born', 'Born Alive', 'Stillborn']],
    body: farrowingRows.length > 0 ? farrowingRows : [['No historical farrowings recorded.', '-', '-', '-', '-']],
    headStyles: { fillColor: [37, 99, 235] },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 14, right: 14 },
  });

  currentY = (doc as any).lastAutoTable.finalY + 10;

  // Recent Incident / Crushing Alerts History
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text('Posture & Crushing Alert Incident History', 14, currentY);
  currentY += 4;

  const alertRows = (data.alertsHistory || []).map(alert => [
    (alert.type || 'Alert').replace('_', ' ').toUpperCase(),
    new Date(alert.created_at).toLocaleString(),
    (alert.severity || 'medium').toUpperCase(),
    (alert.is_resolved || alert.is_read) ? 'RESOLVED' : 'ACTIVE',
  ]);

  autoTable(doc, {
    startY: currentY,
    head: [['Alert Type', 'Timestamp', 'Severity', 'Status']],
    body: alertRows.length > 0 ? alertRows : [['No incident alerts recorded for this sow.', '-', '-', '-']],
    headStyles: { fillColor: [30, 41, 59] },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 14, right: 14 },
  });

  addReportFooter(doc);
  doc.save(`PrismaAtlas_SowPassport_${sow.tag_id}_${new Date().toISOString().slice(0, 10)}.pdf`);
};

// ────────────────────────────────────────────────────────────────────────────
// 4. INCIDENT & SAFETY AUDIT LOG REPORT
// ────────────────────────────────────────────────────────────────────────────
export interface AlertIncidentReportData {
  alerts: Array<Alert>;
  filterLabel?: string;
}

export const generateAlertIncidentPDF = (data: AlertIncidentReportData) => {
  const doc = new jsPDF('p', 'mm', 'a4');

  addReportHeader(doc, {
    title: 'INCIDENT & SAFETY AUDIT LOG',
    dateRange: data.filterLabel || 'All Historical Records',
  });

  let currentY = 36;

  const total = data.alerts.length;
  const highSev = data.alerts.filter(a => a.severity === 'high' || a.severity === 'critical').length;
  const resolved = data.alerts.filter(a => a.is_resolved || a.is_read).length;
  const unresolved = total - resolved;

  // Metric Cards
  const cards: MetricCard[] = [
    { label: 'Total Incidents', value: total, color: [37, 99, 235] },
    { label: 'High / Critical', value: highSev, color: highSev > 0 ? [239, 68, 68] : [16, 185, 129] },
    { label: 'Resolved Alerts', value: resolved, color: [16, 185, 129] },
    { label: 'Unresolved Alerts', value: unresolved, color: unresolved > 0 ? [245, 158, 11] : [16, 185, 129] },
  ];

  currentY = drawMetricCards(doc, currentY, cards);

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text('Detailed Incident Logs', 14, currentY);
  currentY += 4;

  const rows = data.alerts.map(a => [
    `#${a.id}`,
    a.created_at ? new Date(a.created_at).toLocaleString() : 'N/A',
    (a.type || 'alert').replace('_', ' ').toUpperCase(),
    a.pen_id ? `Pen #${a.pen_id}` : (a.sow_id ? `Sow #${a.sow_id}` : 'General'),
    (a.severity || 'medium').toUpperCase(),
    (a.is_resolved || a.is_read) ? 'RESOLVED' : 'ACTIVE',
  ]);

  autoTable(doc, {
    startY: currentY,
    head: [['ID', 'Timestamp', 'Alert Type', 'Target', 'Severity', 'Status']],
    body: rows.length > 0 ? rows : [['No incident alerts match current criteria.', '-', '-', '-', '-', '-']],
    headStyles: { fillColor: [30, 41, 59] },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 14, right: 14 },
  });

  addReportFooter(doc);
  doc.save(`PrismaAtlas_IncidentAuditLog_${new Date().toISOString().slice(0, 10)}.pdf`);
};
