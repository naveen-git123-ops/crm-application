import React, { useMemo, useState } from 'react';
import { Phone, Target } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { BpoCallDesk } from '@/components/businessPotential/BpoCallDesk';
import { BpoAdminPanel } from '@/components/businessPotential/BpoAdminPanel';
import { useRegisterPageHeader } from '@/contexts/PageHeaderContext';
import { useAuth } from '@/contexts/AuthContext';
import { isAdminUser } from '@/lib/permissions';
import { cn } from '@/lib/utils';

export function BpoDesk() {
  const { user } = useAuth();
  const isAdmin = isAdminUser(user);
  const [viewTab, setViewTab] = useState('desk');

  useRegisterPageHeader({
    subtitle: viewTab === 'admin'
      ? 'Daily BPO targets and progress'
      : 'Yellow first, then expired (red), then blue · Our client, on hold, site visit, not qualified',
    enabled: true,
  });

  const tabs = useMemo(
    () => [
      { key: 'desk', label: 'Work queue', icon: Phone },
      ...(isAdmin ? [{ key: 'admin', label: 'Targets', icon: Target }] : []),
    ],
    [isAdmin],
  );

  return (
    <div className="flex h-[calc(100dvh-13rem)] min-h-0 min-w-0 flex-col lg:h-[calc(100dvh-8.5rem)]" data-testid="bpo-desk-page">
      <Card className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-4 sm:p-5 space-y-4">
        {tabs.length > 1 && (
          <div className="flex shrink-0 flex-wrap gap-2">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setViewTab(tab.key)}
                className={cn(
                  'inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium',
                  viewTab === tab.key ? 'border-indigo-300 bg-indigo-50 text-indigo-800' : 'border-gray-200 bg-white text-gray-700 hover:bg-slate-50',
                )}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            ))}
          </div>
        )}
        {viewTab === 'desk' && <BpoCallDesk />}
        {viewTab === 'admin' && isAdmin && <BpoAdminPanel />}
      </Card>
    </div>
  );
}

export default BpoDesk;
