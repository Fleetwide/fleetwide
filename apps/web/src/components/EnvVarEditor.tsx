import { Plus, Trash2 } from 'lucide-react';

interface EnvVar {
  key: string;
  value: string;
}

export function EnvVarEditor({
  variables,
  onChange,
}: {
  variables: Record<string, string>;
  onChange: (variables: Record<string, string>) => void;
}) {
  const entries: EnvVar[] = Object.entries(variables).map(([key, value]) => ({ key, value }));

  const toRecord = (items: EnvVar[]): Record<string, string> => {
    const result: Record<string, string> = {};
    for (const item of items) {
      if (item.key.trim()) result[item.key.trim()] = item.value;
    }
    return result;
  };

  const addVar = () => {
    onChange(toRecord([...entries, { key: '', value: '' }]));
  };

  const updateKey = (index: number, key: string) => {
    const updated = [...entries];
    updated[index] = { ...updated[index], key };
    onChange(toRecord(updated));
  };

  const updateValue = (index: number, value: string) => {
    const updated = [...entries];
    updated[index] = { ...updated[index], value };
    onChange(toRecord(updated));
  };

  const removeVar = (index: number) => {
    onChange(toRecord(entries.filter((_, i) => i !== index)));
  };

  return (
    <div>
      <label className="block text-sm font-medium text-gray-300 mb-2">Environment Variables</label>

      {entries.length > 0 && (
        <div className="space-y-2 mb-3">
          {entries.map((entry, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="text"
                value={entry.key}
                onChange={(e) => updateKey(i, e.target.value)}
                placeholder="KEY"
                className="w-40 rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm font-mono text-white placeholder-gray-500 focus:border-blue-600 focus:outline-none"
              />
              <span className="text-gray-600">=</span>
              <input
                type="text"
                value={entry.value}
                onChange={(e) => updateValue(i, e.target.value)}
                placeholder="value"
                className="flex-1 rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm font-mono text-white placeholder-gray-500 focus:border-blue-600 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => removeVar(i)}
                className="rounded-md p-2 text-gray-500 hover:bg-red-900/30 hover:text-red-400 transition-colors"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={addVar}
        className="flex items-center gap-1.5 rounded-md border border-dashed border-gray-700 px-3 py-2 text-xs text-gray-400 hover:border-gray-600 hover:text-gray-300 transition-colors w-full justify-center"
      >
        <Plus size={14} />
        Add variable
      </button>
    </div>
  );
}
