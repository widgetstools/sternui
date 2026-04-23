import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Badge,
} from '@stern/ui';
import { Database, Globe, Wifi, Zap, TestTube, Check } from 'lucide-react';
import type { ProviderType } from '@stern/shared-types';

interface TypeSelectionDialogProps {
  open: boolean;
  onClose: () => void;
  onSelect: (type: ProviderType) => void;
}

interface ProviderTypeOption {
  type: ProviderType;
  icon: React.ReactNode;
  title: string;
  description: string;
  features: string[];
  recommended?: boolean;
  gradientFrom: string;
  gradientTo: string;
}

const PROVIDER_OPTIONS: ProviderTypeOption[] = [
  {
    type: 'stomp',
    icon: <Wifi className="h-8 w-8" />,
    title: 'STOMP Data Provider',
    description: 'Real-time streaming data via WebSocket STOMP protocol',
    features: ['Real-time updates', 'Field inference', 'Template variables'],
    recommended: true,
    gradientFrom: 'from-blue-500',
    gradientTo: 'to-cyan-500',
  },
  {
    type: 'rest',
    icon: <Globe className="h-8 w-8" />,
    title: 'REST API',
    description: 'Poll data from HTTP REST endpoints',
    features: ['Simple integration', 'Pagination support', 'Flexible polling'],
    gradientFrom: 'from-green-500',
    gradientTo: 'to-emerald-500',
  },
  {
    type: 'websocket',
    icon: <Zap className="h-8 w-8" />,
    title: 'WebSocket',
    description: 'Native WebSocket connections for real-time data',
    features: ['Low latency', 'Binary support', 'Auto-reconnect'],
    gradientFrom: 'from-purple-500',
    gradientTo: 'to-pink-500',
  },
  {
    type: 'socketio',
    icon: <Database className="h-8 w-8" />,
    title: 'Socket.IO',
    description: 'Socket.IO client for event-based communication',
    features: ['Event system', 'Room support', 'Fallback transport'],
    gradientFrom: 'from-orange-500',
    gradientTo: 'to-red-500',
  },
  {
    type: 'mock',
    icon: <TestTube className="h-8 w-8" />,
    title: 'Mock Data',
    description: 'Generate test data for development and demos',
    features: ['No dependencies', 'Configurable rows', 'Random updates'],
    gradientFrom: 'from-gray-500',
    gradientTo: 'to-slate-500',
  },
];

export const TypeSelectionDialog: React.FC<TypeSelectionDialogProps> = ({
  open,
  onClose,
  onSelect,
}) => {
  const handleSelect = (type: ProviderType) => {
    onSelect(type);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[900px] max-h-[85vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="text-2xl">Select Data Provider Type</DialogTitle>
          <DialogDescription>
            Choose the protocol that best fits your data provider requirements
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 py-6 overflow-y-auto max-h-[calc(85vh-120px)]">
          {PROVIDER_OPTIONS.map((option) => (
            <button
              key={option.type}
              onClick={() => handleSelect(option.type)}
              className="group relative flex flex-col p-6 border-2 border-border rounded-xl hover:border-primary hover:shadow-lg transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] bg-card text-left"
            >
              {option.recommended && (
                <Badge className="absolute -top-2 -right-2 bg-gradient-to-r from-amber-500 to-orange-500 border-none text-white shadow-md">
                  Recommended
                </Badge>
              )}

              <div
                className={`w-16 h-16 rounded-lg bg-gradient-to-br ${option.gradientFrom} ${option.gradientTo} flex items-center justify-center text-white mb-4 group-hover:shadow-lg transition-shadow duration-300`}
              >
                {option.icon}
              </div>

              <h3 className="text-lg font-semibold mb-2 group-hover:text-primary transition-colors">
                {option.title}
              </h3>

              <p className="text-sm text-muted-foreground mb-4 flex-1">{option.description}</p>

              <div className="space-y-1.5">
                {option.features.map((feature, index) => (
                  <div key={index} className="flex items-start gap-2 text-xs">
                    <Check className="h-3.5 w-3.5 text-primary flex-shrink-0 mt-0.5" />
                    <span className="text-muted-foreground">{feature}</span>
                  </div>
                ))}
              </div>

              <div className="absolute inset-0 rounded-xl bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};
