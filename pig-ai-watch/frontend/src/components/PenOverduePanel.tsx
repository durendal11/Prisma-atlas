import React, { useEffect, useState } from 'react';
import { AlertCircle, FileText, Stethoscope } from 'lucide-react';
import api from '../services/api';

export function PenOverduePanel({ sowId }: { sowId: number }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showAcknowledge, setShowAcknowledge] = useState(false);
  const [notes, setNotes] = useState('');

  const fetchSummary = async () => {
    try {
      const res = await api.get(`/farrowing/overdue-sows/${sowId}/summary`);
      setData(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, [sowId]);

  const handleAcknowledge = async () => {
    try {
      await api.post(`/farrowing/overdue-sows/${sowId}/acknowledge`, { notes: notes || 'Acknowledged by staff' });
      setShowAcknowledge(false);
      alert('Overdue state acknowledged.');
    } catch (err) {
      console.error(err);
      alert('Failed to acknowledge overdue state');
    }
  };

  if (loading || !data) return null;

  const bgColors = {
    1: 'bg-amber-50 border-amber-200 text-amber-900',
    2: 'bg-orange-50 border-orange-200 text-orange-900',
    3: 'bg-red-50 border-red-200 text-red-900'
  };

  const bg = bgColors[data.tier as keyof typeof bgColors] || 'bg-gray-50 border-gray-200 text-gray-900';

  return (
    <div className={`p-4 rounded-xl border mb-5 ${bg}`}>
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-bold text-lg flex items-center gap-2">
            <AlertCircle /> DELAYED FARROWING: DAY +{data.days_overdue} (Tier {data.tier})
          </h3>
          <ul className="mt-2 space-y-1 text-sm list-disc list-inside ml-5">
            <li>Level: {data.tier === 1 ? 'Watch Status' : data.tier === 2 ? 'Action Threshold' : 'Critical - Prolonged Gestation'}</li>
            <li>Compound Risk: {data.compound_risk_active ? <span className="text-red-600 font-bold">ACTIVE</span> : 'None detected'}</li>
            <li>Monitoring: {data.intensified_monitoring ? 'Intensified (6s logs)' : 'Standard'}</li>
            {data.checklist_task && (
              <li>Pre-induction checklist task generated!</li>
            )}
          </ul>
        </div>
        <div className="flex flex-col gap-2">
          {!showAcknowledge ? (
            <button
              onClick={() => setShowAcknowledge(true)}
              className="px-4 py-2 bg-white/50 hover:bg-white/80 rounded-lg text-sm font-semibold border border-current transition"
            >
              Acknowledge
            </button>
          ) : (
            <div className="flex flex-col gap-2 bg-white p-3 border rounded-lg shadow-sm w-64">
              <input 
                type="text" 
                placeholder="Veterinary notes..." 
                className="text-sm px-2 py-1 border rounded"
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
              <div className="flex gap-2 text-sm justify-end">
                <button onClick={() => setShowAcknowledge(false)} className="text-gray-500">Cancel</button>
                <button onClick={handleAcknowledge} className="text-blue-600 font-bold">Submit</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}