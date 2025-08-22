import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
import * as XLSX from 'xlsx';

ChartJS.register(ArcElement, Tooltip, Legend);

// Types
type Status = "Ongoing" | "Completed" | "Scheduled" | "Planned" | "Pending";

interface HRItem {
  id: string;
  activity: string;
  bus: string;
  owner: string;
  status: Status;
  date?: string;
  details?: string;
}

interface AppState {
  items: HRItem[];
  lastModified: number | null;
  version: number;
}

interface Filters {
  status: string;
  bus: string;
  owner: string;
  onlyOngoing: boolean;
}

interface SortConfig {
  by: keyof HRItem;
  dir: 'asc' | 'desc';
}

interface BulkActions {
  status: string;
  owner: string;
  bus: string;
}

const HRUpdate: React.FC = () => {
  // Constants
  const STORAGE_KEY = 'ghr:update:v4';
  const SCHEMA_VERSION = 4;
  const STATUS_OPTIONS: Status[] = ["Ongoing", "Completed", "Scheduled", "Planned", "Pending"];
  const STATUS_MAP: Record<string, Status> = {
    'initial plan shared': 'Planned',
    'planning phase': 'Planned',
    'returned from ec': 'Planned',
    'work in progress': 'Ongoing',
    'finalized': 'Completed',
    'clarified': 'Planned',
    'pending directive': 'Pending',
    'pending ec submission': 'Pending',
    'tbd': 'Pending',
    '10 pending': 'Pending'
  };

  // State
  const [items, setItems] = useState<HRItem[]>([]);
  const [view, setView] = useState<'table' | 'charts'>('table');
  const [fullWidth, setFullWidth] = useState(false);
  const [presentationMode, setPresentationMode] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [lastSaved, setLastSaved] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<HRItem>>({});
  
  // Quick Add Form
  const [quickAdd, setQuickAdd] = useState({
    activity: '',
    bus: '',
    owner: '',
    status: 'Ongoing' as Status,
    date: '',
    details: ''
  });
  const [addWarning, setAddWarning] = useState('');

  // Filters & Sorting
  const [filters, setFilters] = useState<Filters>({
    status: '',
    bus: '',
    owner: '',
    onlyOngoing: false
  });
  const [sort, setSort] = useState<SortConfig>({ by: 'date', dir: 'asc' });
  
  // Selection & Bulk
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<BulkActions>({ status: '', owner: '', bus: '' });

  // History (Undo/Redo)
  const [history, setHistory] = useState<string[]>([]);
  const [future, setFuture] = useState<string[]>([]);

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const saveTimerRef = useRef<number>();

  // Derived values
  const today = useMemo(() => new Date().toISOString().split('T')[0], []);
  
  const uniqueBUs = useMemo(() => {
    const set = new Set(items.map(i => i.bus).filter(Boolean));
    return Array.from(set).sort();
  }, [items]);

  const uniqueOwners = useMemo(() => {
    const set = new Set(items.map(i => i.owner).filter(Boolean));
    return Array.from(set).sort();
  }, [items]);

  const processedItems = useMemo(() => {
    let filtered = [...items];
    
    // Apply filters
    if (filters.onlyOngoing) {
      filtered = filtered.filter(i => normalizeStatus(i.status) === 'Ongoing');
    }
    if (filters.status) {
      filtered = filtered.filter(i => normalizeStatus(i.status) === filters.status);
    }
    if (filters.bus) {
      filtered = filtered.filter(i => i.bus === filters.bus);
    }
    if (filters.owner) {
      filtered = filtered.filter(i => i.owner === filters.owner);
    }

    // Apply sorting
    const sortKey = sort.by;
    const direction = sort.dir === 'asc' ? 1 : -1;
    
    filtered.sort((a, b) => {
      let valueA = a[sortKey] || '';
      let valueB = b[sortKey] || '';
      
      if (sortKey === 'date') {
        if (!valueA && valueB) return 1;
        if (valueA && !valueB) return -1;
      }
      
      return String(valueA).localeCompare(String(valueB), undefined, {
        numeric: sortKey === 'date',
        sensitivity: 'base'
      }) * direction;
    });

    return filtered;
  }, [items, filters, sort]);

  const chartData = useMemo(() => {
    const counts: Record<string, number> = {};
    items.forEach(item => {
      const status = normalizeStatus(item.status);
      counts[status] = (counts[status] || 0) + 1;
    });

    return {
      labels: Object.keys(counts),
      datasets: [{
        data: Object.values(counts),
        backgroundColor: [
          '#3B82F6', // Blue
          '#10B981', // Green
          '#F59E0B', // Yellow
          '#6B7280', // Gray
          '#EF4444', // Red
        ],
        borderWidth: 2,
        borderColor: darkMode ? '#1F2937' : '#FFFFFF'
      }]
    };
  }, [items, darkMode]);

  // Utility functions
  const normalizeStatus = (status: string): Status => {
    if (!status) return 'Pending';
    const normalized = STATUS_MAP[status.toLowerCase().trim()];
    return normalized || (STATUS_OPTIONS.includes(status as Status) ? status as Status : 'Pending');
  };

  const isValidDate = (dateStr: string): boolean => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
    const date = new Date(dateStr);
    const [year, month, day] = dateStr.split('-').map(Number);
    return date instanceof Date && !isNaN(date.getTime()) &&
           date.getUTCFullYear() === year &&
           date.getUTCMonth() + 1 === month &&
           date.getUTCDate() === day;
  };

  const generateId = (): string => Math.random().toString(36).substr(2, 9);

  // History management
  const pushHistory = useCallback(() => {
    const snapshot = JSON.stringify(items);
    setHistory(prev => {
      const newHistory = [...prev, snapshot];
      return newHistory.length > 10 ? newHistory.slice(1) : newHistory;
    });
    setFuture([]);
  }, [items]);

  const undo = useCallback(() => {
    if (history.length === 0) return;
    
    const current = JSON.stringify(items);
    const previous = history[history.length - 1];
    
    setFuture(prev => [current, ...prev]);
    setHistory(prev => prev.slice(0, -1));
    setItems(JSON.parse(previous));
    setSelected(new Set());
  }, [history, items]);

  const redo = useCallback(() => {
    if (future.length === 0) return;
    
    const current = JSON.stringify(items);
    const next = future[0];
    
    setHistory(prev => [...prev, current]);
    setFuture(prev => prev.slice(1));
    setItems(JSON.parse(next));
    setSelected(new Set());
  }, [future, items]);

  // Persistence
  const debouncedSave = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(() => {
      const state: AppState = {
        items,
        lastModified: Date.now(),
        version: SCHEMA_VERSION
      };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        setLastSaved(state.lastModified);
      } catch (error) {
        console.error('Save failed:', error);
      }
    }, 300);
  }, [items]);

  const loadData = useCallback(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const state: AppState = JSON.parse(saved);
        if (state.version === SCHEMA_VERSION && Array.isArray(state.items)) {
          setItems(state.items);
          setLastSaved(state.lastModified);
          return;
        }
      }
    } catch (error) {
      console.error('Load failed:', error);
    }
    
    // Load sample data if no valid data exists
    setItems(getSampleData());
  }, []);

  // CRUD Operations
  const addItem = () => {
    setAddWarning('');
    
    if (!quickAdd.activity.trim()) {
      setAddWarning('Activity is required.');
      return;
    }
    
    if (quickAdd.date && !isValidDate(quickAdd.date)) {
      setAddWarning('Date format is invalid.');
      return;
    }

    pushHistory();
    const newItem: HRItem = {
      id: generateId(),
      activity: quickAdd.activity.trim(),
      bus: quickAdd.bus.trim(),
      owner: quickAdd.owner.trim(),
      status: quickAdd.status,
      date: quickAdd.date || undefined,
      details: quickAdd.details.trim() || undefined
    };
    
    setItems(prev => [...prev, newItem]);
    setQuickAdd({
      activity: '',
      bus: '',
      owner: '',
      status: 'Ongoing',
      date: '',
      details: ''
    });
  };

  const startEdit = (item: HRItem) => {
    if (presentationMode) return;
    setEditingId(item.id);
    setEditForm({ ...item });
  };

  const saveEdit = () => {
    if (!editForm.activity?.trim()) {
      alert('Activity is required.');
      return;
    }
    
    if (editForm.date && !isValidDate(editForm.date)) {
      if (!confirm('Date format looks invalid. Save anyway?')) return;
    }

    pushHistory();
    setItems(prev => prev.map(item => 
      item.id === editingId ? { ...item, ...editForm } : item
    ));
    setEditingId(null);
    setEditForm({});
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const deleteItem = (id: string) => {
    if (presentationMode) return;
    if (!confirm('Delete this item?')) return;
    
    pushHistory();
    setItems(prev => prev.filter(item => item.id !== id));
    setSelected(prev => {
      const newSelected = new Set(prev);
      newSelected.delete(id);
      return newSelected;
    });
  };

  // Bulk operations
  const toggleSelect = (id: string, checked: boolean) => {
    setSelected(prev => {
      const newSelected = new Set(prev);
      if (checked) {
        newSelected.add(id);
      } else {
        newSelected.delete(id);
      }
      return newSelected;
    });
  };

  const toggleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelected(new Set(processedItems.map(item => item.id)));
    } else {
      setSelected(new Set());
    }
  };

  const applyBulkActions = () => {
    if (selected.size === 0) return;
    
    pushHistory();
    setItems(prev => prev.map(item => {
      if (!selected.has(item.id)) return item;
      
      const updated = { ...item };
      if (bulk.status) updated.status = bulk.status as Status;
      if (bulk.owner) updated.owner = bulk.owner;
      if (bulk.bus) updated.bus = bulk.bus;
      return updated;
    }));
    
    setBulk({ status: '', owner: '', bus: '' });
  };

  const bulkDelete = () => {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} selected items?`)) return;
    
    pushHistory();
    setItems(prev => prev.filter(item => !selected.has(item.id)));
    setSelected(new Set());
  };

  // Import/Export
  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        let rows: any[] = [];

        if (file.name.toLowerCase().endsWith('.csv')) {
          const text = new TextDecoder().decode(data as ArrayBuffer);
          const worksheet = (XLSX.utils as any).csv_to_sheet(text);
          rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
        } else {
          const workbook = XLSX.read(data, { type: 'array' });
          const worksheet = workbook.Sheets[workbook.SheetNames[0]];
          rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
        }

        const importedItems: HRItem[] = rows.map(row => ({
          id: generateId(),
          activity: row['Activity'] || '',
          bus: row['BU(s)'] || row['BU'] || '',
          owner: row['Owner'] || '',
          status: normalizeStatus(row['Status'] || 'Ongoing'),
          date: row['Target Date'] || row['Date'] || undefined,
          details: row['Details'] || undefined
        })).filter(item => item.activity.trim());

        if (importedItems.length === 0) {
          alert('No valid items found in the file.');
          return;
        }

        pushHistory();
        setItems(importedItems);
        setSelected(new Set());
        alert(`Imported ${importedItems.length} items successfully.`);
      } catch (error) {
        alert('Import failed: ' + (error as Error).message);
      } finally {
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    };

    reader.readAsArrayBuffer(file);
  };

  const exportExcel = () => {
    const exportData = items.map(item => ({
      'Activity': item.activity,
      'BU(s)': item.bus,
      'Owner': item.owner,
      'Status': normalizeStatus(item.status),
      'Target Date': item.date || '',
      'Details': item.details || ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'HR Update');
    XLSX.writeFile(workbook, `hr_update_${today}.xlsx`);
  };

  const exportCSV = () => {
    const exportData = items.map(item => ({
      'Activity': item.activity,
      'BU(s)': item.bus,
      'Owner': item.owner,
      'Status': normalizeStatus(item.status),
      'Target Date': item.date || '',
      'Details': item.details || ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const csv = XLSX.utils.sheet_to_csv(worksheet);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `hr_update_${today}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const clearAllData = () => {
    if (!confirm('Clear all data? Export first if needed.')) return;
    
    localStorage.removeItem(STORAGE_KEY);
    setItems(getSampleData());
    setHistory([]);
    setFuture([]);
    setSelected(new Set());
    setLastSaved(null);
  };

  // Sample data
  const getSampleData = (): HRItem[] => [
    {
      id: generateId(),
      activity: 'Technical Competency Mapping',
      bus: 'PPC',
      owner: 'Ghassan',
      status: 'Ongoing',
      date: '2025-07-31'
    },
    {
      id: generateId(),
      activity: 'Unpaid Leave Plan - Iraq',
      bus: 'PPC',
      owner: 'Ghassan, Sobana, Samir',
      status: 'Planned',
      date: '2025-07-28'
    },
    {
      id: generateId(),
      activity: 'Unified Pay Structure Review',
      bus: 'PPC',
      owner: 'Ghassan, Sobana, Samir',
      status: 'Scheduled',
      date: '2025-07-29'
    }
  ];

  // Effects
  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    debouncedSave();
  }, [items, debouncedSave]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  // Presentation mode event handlers
  useEffect(() => {
    if (presentationMode) {
      const handleContextMenu = (e: MouseEvent) => e.preventDefault();
      const handleSelectStart = (e: Event) => e.preventDefault();
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.ctrlKey && (e.key === 'a' || e.key === 'c' || e.key === 's')) {
          e.preventDefault();
        }
      };

      document.addEventListener('contextmenu', handleContextMenu);
      document.addEventListener('selectstart', handleSelectStart);
      document.addEventListener('keydown', handleKeyDown);

      return () => {
        document.removeEventListener('contextmenu', handleContextMenu);
        document.removeEventListener('selectstart', handleSelectStart);
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [presentationMode]);

  const getStatusColor = (status: Status): string => {
    const colors = {
      'Ongoing': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      'Completed': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      'Scheduled': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
      'Planned': 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
      'Pending': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
    };
    return colors[status] || colors['Pending'];
  };

  const baseClasses = darkMode ? 'dark' : '';

  return (
    <div className={`${baseClasses} min-h-screen transition-colors duration-200`}>
      <div className={`${fullWidth ? 'max-w-full px-4' : 'max-w-7xl mx-auto px-4'} py-6 bg-gray-50 dark:bg-gray-900 min-h-screen transition-all duration-300`}>
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            HR Bi-Weekly Update
          </h1>
          <div className="text-sm text-gray-600 dark:text-gray-400 space-x-4">
            <span><strong>Date:</strong> {today}</span>
            <span><strong>Items:</strong> {items.length}</span>
            <span><strong>Last saved:</strong> {lastSaved ? new Date(lastSaved).toLocaleString() : '—'}</span>
          </div>
        </div>

        {/* Toolbar */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 mb-6 print:hidden">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setFullWidth(!fullWidth)}
                className="px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                {fullWidth ? 'Narrow View' : 'Full Width'}
              </button>
              <button
                onClick={() => setPresentationMode(!presentationMode)}
                className={`px-3 py-2 rounded-md transition-colors ${
                  presentationMode 
                    ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' 
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {presentationMode ? 'Exit Presentation' : 'Presentation Mode'}
              </button>
              <button
                onClick={() => setDarkMode(!darkMode)}
                className="px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                {darkMode ? '☀️' : '🌙'}
              </button>
              <button
                onClick={() => window.print()}
                className="px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                Print/PDF
              </button>
            </div>

            {!presentationMode && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={exportExcel}
                  className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                >
                  Export Excel
                </button>
                <button
                  onClick={exportCSV}
                  className="px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
                >
                  Export CSV
                </button>
                <label className="px-3 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors cursor-pointer">
                  Import
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleImport}
                    className="hidden"
                  />
                </label>
                <button
                  onClick={undo}
                  disabled={history.length === 0}
                  className="px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Undo
                </button>
                <button
                  onClick={redo}
                  disabled={future.length === 0}
                  className="px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Redo
                </button>
                <button
                  onClick={clearAllData}
                  className="px-3 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
                >
                  Clear Cache
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Quick Add */}
        {!presentationMode && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Quick Add</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3">
              <input
                type="text"
                placeholder="Activity *"
                value={quickAdd.activity}
                onChange={(e) => setQuickAdd(prev => ({ ...prev, activity: e.target.value }))}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              />
              <input
                type="text"
                placeholder="BU(s)"
                value={quickAdd.bus}
                onChange={(e) => setQuickAdd(prev => ({ ...prev, bus: e.target.value }))}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              />
              <input
                type="text"
                placeholder="Owner/Lead"
                value={quickAdd.owner}
                onChange={(e) => setQuickAdd(prev => ({ ...prev, owner: e.target.value }))}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              />
              <select
                value={quickAdd.status}
                onChange={(e) => setQuickAdd(prev => ({ ...prev, status: e.target.value as Status }))}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              >
                {STATUS_OPTIONS.map(status => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
              <input
                type="date"
                value={quickAdd.date}
                onChange={(e) => setQuickAdd(prev => ({ ...prev, date: e.target.value }))}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              />
              <button
                onClick={addItem}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                Add
              </button>
            </div>
            {addWarning && (
              <p className="mt-2 text-sm text-red-600 dark:text-red-400">{addWarning}</p>
            )}
          </div>
        )}

        {/* Filters & Bulk Actions */}
        {!presentationMode && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 mb-6">
            {/* Filters */}
            <div className="mb-4">
              <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">Filters & Sorting</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-3">
                <select
                  value={filters.status}
                  onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white text-sm"
                >
                  <option value="">All Statuses</option>
                  {STATUS_OPTIONS.map(status => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
                <select
                  value={filters.bus}
                  onChange={(e) => setFilters(prev => ({ ...prev, bus: e.target.value }))}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white text-sm"
                >
                  <option value="">All BUs</option>
                  {uniqueBUs.map(bu => (
                    <option key={bu} value={bu}>{bu}</option>
                  ))}
                </select>
                <select
                  value={filters.owner}
                  onChange={(e) => setFilters(prev => ({ ...prev, owner: e.target.value }))}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white text-sm"
                >
                  <option value="">All Owners</option>
                  {uniqueOwners.map(owner => (
                    <option key={owner} value={owner}>{owner}</option>
                  ))}
                </select>
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={filters.onlyOngoing}
                    onChange={(e) => setFilters(prev => ({ ...prev, onlyOngoing: e.target.checked }))}
                    className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Only Ongoing</span>
                </label>
                <select
                  value={sort.by}
                  onChange={(e) => setSort(prev => ({ ...prev, by: e.target.value as keyof HRItem }))}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white text-sm"
                >
                  <option value="activity">Sort by Activity</option>
                  <option value="bus">Sort by BU</option>
                  <option value="owner">Sort by Owner</option>
                  <option value="status">Sort by Status</option>
                  <option value="date">Sort by Date</option>
                </select>
                <select
                  value={sort.dir}
                  onChange={(e) => setSort(prev => ({ ...prev, dir: e.target.value as 'asc' | 'desc' }))}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white text-sm"
                >
                  <option value="asc">Ascending</option>
                  <option value="desc">Descending</option>
                </select>
                <div className="text-sm text-gray-600 dark:text-gray-400 flex items-center">
                  Showing {processedItems.length} of {items.length}
                </div>
              </div>
            </div>

            {/* Bulk Actions */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
              <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">Bulk Actions</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3">
                <select
                  value={bulk.status}
                  onChange={(e) => setBulk(prev => ({ ...prev, status: e.target.value }))}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white text-sm"
                >
                  <option value="">Set Status...</option>
                  {STATUS_OPTIONS.map(status => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Set Owner..."
                  value={bulk.owner}
                  onChange={(e) => setBulk(prev => ({ ...prev, owner: e.target.value }))}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white text-sm"
                />
                <input
                  type="text"
                  placeholder="Set BU..."
                  value={bulk.bus}
                  onChange={(e) => setBulk(prev => ({ ...prev, bus: e.target.value }))}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white text-sm"
                />
                <button
                  onClick={applyBulkActions}
                  disabled={selected.size === 0}
                  className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  Apply to Selected ({selected.size})
                </button>
                <button
                  onClick={bulkDelete}
                  disabled={selected.size === 0}
                  className="px-3 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  Delete Selected
                </button>
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    onChange={(e) => toggleSelectAll(e.target.checked)}
                    className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Select All</span>
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="mb-6 print:hidden">
          <div className="border-b border-gray-200 dark:border-gray-700">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setView('table')}
                className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                  view === 'table'
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300'
                }`}
              >
                Table View
              </button>
              <button
                onClick={() => setView('charts')}
                className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                  view === 'charts'
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300'
                }`}
              >
                Charts View
              </button>
            </nav>
          </div>
        </div>

        {/* Table View */}
        {view === 'table' && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    {!presentationMode && (
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider print:hidden">
                        Select
                      </th>
                    )}
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Activity
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      BU(s)
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Owner
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Target Date
                    </th>
                    {!presentationMode && (
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider print:hidden">
                        Actions
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {processedItems.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                      {!presentationMode && (
                        <td className="px-6 py-4 whitespace-nowrap print:hidden">
                          <input
                            type="checkbox"
                            checked={selected.has(item.id)}
                            onChange={(e) => toggleSelect(item.id, e.target.checked)}
                            className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                          />
                        </td>
                      )}
                      
                      {/* Activity */}
                      <td className="px-6 py-4">
                        {editingId === item.id ? (
                          <div className="space-y-2">
                            <input
                              type="text"
                              value={editForm.activity || ''}
                              onChange={(e) => setEditForm(prev => ({ ...prev, activity: e.target.value }))}
                              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white text-sm"
                              placeholder="Activity"
                            />
                            <textarea
                              value={editForm.details || ''}
                              onChange={(e) => setEditForm(prev => ({ ...prev, details: e.target.value }))}
                              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white text-sm"
                              placeholder="Details (optional)"
                              rows={2}
                            />
                          </div>
                        ) : (
                          <div>
                            <div className="text-sm font-medium text-gray-900 dark:text-white">
                              {item.activity}
                            </div>
                            {item.details && (
                              <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                {item.details}
                              </div>
                            )}
                          </div>
                        )}
                      </td>

                      {/* BU(s) */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        {editingId === item.id ? (
                          <input
                            type="text"
                            value={editForm.bus || ''}
                            onChange={(e) => setEditForm(prev => ({ ...prev, bus: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white text-sm"
                            placeholder="BU(s)"
                          />
                        ) : (
                          <div className="text-sm text-gray-900 dark:text-white">{item.bus}</div>
                        )}
                      </td>

                      {/* Owner */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        {editingId === item.id ? (
                          <input
                            type="text"
                            value={editForm.owner || ''}
                            onChange={(e) => setEditForm(prev => ({ ...prev, owner: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white text-sm"
                            placeholder="Owner/Lead"
                          />
                        ) : (
                          <div className="text-sm text-gray-900 dark:text-white">{item.owner}</div>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        {editingId === item.id ? (
                          <select
                            value={editForm.status || item.status}
                            onChange={(e) => setEditForm(prev => ({ ...prev, status: e.target.value as Status }))}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white text-sm"
                          >
                            {STATUS_OPTIONS.map(status => (
                              <option key={status} value={status}>{status}</option>
                            ))}
                          </select>
                        ) : (
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(normalizeStatus(item.status))}`}>
                            {normalizeStatus(item.status)}
                          </span>
                        )}
                      </td>

                      {/* Target Date */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        {editingId === item.id ? (
                          <input
                            type="date"
                            value={editForm.date || ''}
                            onChange={(e) => setEditForm(prev => ({ ...prev, date: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white text-sm"
                          />
                        ) : (
                          <div className="text-sm text-gray-900 dark:text-white">
                            {item.date || '—'}
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      {!presentationMode && (
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium print:hidden">
                          {editingId === item.id ? (
                            <div className="flex space-x-2">
                              <button
                                onClick={saveEdit}
                                className="text-green-600 hover:text-green-900 dark:text-green-400 dark:hover:text-green-300"
                              >
                                Save
                              </button>
                              <button
                                onClick={cancelEdit}
                                className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-300"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="flex space-x-2">
                              <button
                                onClick={() => startEdit(item)}
                                className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => deleteItem(item.id)}
                                className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {processedItems.length === 0 && (
              <div className="text-center py-12">
                <div className="text-gray-500 dark:text-gray-400">
                  {items.length === 0 ? 'No items yet. Add your first HR activity above.' : 'No items match the current filters.'}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Charts View */}
        {view === 'charts' && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">Status Distribution</h3>
            <div className="max-w-md mx-auto">
              <Doughnut 
                data={chartData}
                options={{
                  responsive: true,
                  maintainAspectRatio: true,
                  plugins: {
                    legend: {
                      position: 'bottom' as const,
                      labels: {
                        color: darkMode ? '#E5E7EB' : '#374151',
                        padding: 20
                      }
                    }
                  }
                }}
              />
            </div>
            
            {/* Statistics */}
            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              {STATUS_OPTIONS.map(status => {
                const count = items.filter(item => normalizeStatus(item.status) === status).length;
                const percentage = items.length > 0 ? Math.round((count / items.length) * 100) : 0;
                
                return (
                  <div key={status} className="text-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <div className={`inline-flex px-3 py-1 text-xs font-semibold rounded-full mb-2 ${getStatusColor(status)}`}>
                      {status}
                    </div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-white">{count}</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">{percentage}%</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Print Styles */}
        <style>{`
          @media print {
            .print\\:hidden {
              display: none !important;
            }
            body {
              background: white !important;
              color: black !important;
            }
            .dark\\:bg-gray-800,
            .dark\\:bg-gray-900 {
              background: white !important;
            }
            .dark\\:text-white,
            .dark\\:text-gray-300 {
              color: black !important;
            }
            .shadow-sm {
              box-shadow: none !important;
            }
          }
        `}</style>
      </div>
    </div>
  );
};

export default HRUpdate;
