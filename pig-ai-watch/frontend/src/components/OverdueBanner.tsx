import React, { useEffect, useState } from 'react';
import { AlertTriangle, Clock, AlertOctagon } from 'lucide-react';
import api from '../services/api';

interface OverdueSow {
  id: number;
  tag_id: string;
  pen_id: number;
  expected_farrowing_date: string;
  days_overdue: number;
  tier: number;
  intensified_monitoring: boolean;
  prolonged_gestation: boolean;
  status: string;
}

export function OverdueBanner() {
  const [overdueSows, setOverdueSows] = useState<OverdueSow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOverdue = async () => {
    try {
      const response = await api.get('/farrowing/overdue-sows');
      setOverdueSows(response.data);
    } catch (err) {
      console.error("Failed to fetch overdue sows", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverdue();
    const interval = setInterval(fetchOverdue, 60000);
    return () => clearInterval(interval);
  }, []);

  if (loading || overdueSows.length === 0) return null;

  const highestTier = Math.max(...overdueSows.map(s => s.tier));

  if (highestTier === 3) {
    const criticalCount = overdueSows.filter(s => s.tier === 3).length;
    return (
      <div className="mb-6 bg-red-100 border border-red-200 p-4 rounded-xl flex items-start gap-4">
        <div className="bg-red-200 p-2 rounded-lg text-red-700 animate-pulse">
          <AlertOctagon size={24} />
        </div>
        <div>
          <h3 className="text-red-900 font-bold text-lg">{criticalCount} sow(s) in prolonged gestation — immediate action required.</h3>
          <p className="text-red-800 text-sm">Critical. Elevated stillbirth risk. Please contact veterinarian immediately.</p>
        </div>
      </div>
    );
  }

  if (highestTier === 2) {
    const actionCount = overdueSows.filter(s => s.tier === 2).length;
    return (
      <div className="mb-6 bg-orange-100 border border-orange-200 p-4 rounded-xl flex items-start gap-4">
        <div className="bg-orange-200 p-2 rounded-lg text-orange-700">
          <AlertTriangle size={24} />
        </div>
        <div>
          <h3 className="text-orange-900 font-bold text-lg">{actionCount} sow(s) eligible for induction — contact veterinarian.</h3>
          <p className="text-orange-800 text-sm">Day 116 reached. Pre-induction tasks have been auto-generated.</p>
        </div>
      </div>
    );
  }

  const watchCount = overdueSows.length;
  return (
    <div className="mb-6 bg-amber-50 border border-amber-200 p-4 rounded-xl flex items-start gap-4">
      <div className="bg-amber-100 p-2 rounded-lg text-amber-700">
        <Clock size={24} />
      </div>
      <div>
        <h3 className="text-amber-900 font-bold text-lg">{watchCount} sow(s) past expected date — monitoring intensified.</h3>
        <p className="text-amber-800 text-sm">Logging rate has been halved to capture subtle distress signals.</p>
      </div>
    </div>
  );
}
