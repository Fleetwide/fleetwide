import { Plus, Trash2, GripVertical } from 'lucide-react';

export function SetupCommandEditor({
  commands,
  onChange,
}: {
  commands: string[];
  onChange: (commands: string[]) => void;
}) {
  const addCommand = () => onChange([...commands, '']);

  const updateCommand = (index: number, value: string) => {
    const updated = [...commands];
    updated[index] = value;
    onChange(updated);
  };

  const removeCommand = (index: number) => {
    onChange(commands.filter((_, i) => i !== index));
  };

  return (
    <div>
      <label className="block text-sm font-medium text-gray-300 mb-2">Setup Commands</label>
      <p className="text-xs text-gray-500 mb-3">
        Commands run in order after the container starts and repos are cloned.
      </p>

      {commands.length > 0 && (
        <div className="space-y-2 mb-3">
          {commands.map((cmd, i) => (
            <div key={i} className="flex items-center gap-2">
              <GripVertical size={14} className="text-gray-600 shrink-0" />
              <input
                type="text"
                value={cmd}
                onChange={(e) => updateCommand(i, e.target.value)}
                placeholder={`e.g., npm install`}
                className="flex-1 rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm font-mono text-white placeholder-gray-500 focus:border-blue-600 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => removeCommand(i)}
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
        onClick={addCommand}
        className="flex items-center gap-1.5 rounded-md border border-dashed border-gray-700 px-3 py-2 text-xs text-gray-400 hover:border-gray-600 hover:text-gray-300 transition-colors w-full justify-center"
      >
        <Plus size={14} />
        Add command
      </button>
    </div>
  );
}
