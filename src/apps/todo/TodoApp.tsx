import React, { useState, useRef, useEffect } from 'react';
import { Plus, Check, X, Edit3, Calendar, Star, Search, Filter, Sparkles } from 'lucide-react';

type Priority = 'low' | 'medium' | 'high';

interface Task {
  id: number;
  text: string;
  completed: boolean;
  priority: Priority;
  category: string;
  dueDate: string;
}

const TodoApp: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([
    { id: 1, text: 'Design new user interface', completed: false, priority: 'high', category: 'Design', dueDate: '2024-08-25' },
    { id: 2, text: 'Review code submissions', completed: true, priority: 'medium', category: 'Development', dueDate: '2024-08-23' },
    { id: 3, text: 'Plan team meeting agenda', completed: false, priority: 'low', category: 'Management', dueDate: '2024-08-26' }
  ]);

  const [newTask, setNewTask] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingText, setEditingText] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTaskPriority, setNewTaskPriority] = useState<Priority>('medium');
  const [newTaskCategory, setNewTaskCategory] = useState('Personal');
  const [newTaskDate, setNewTaskDate] = useState('');

  const inputRef = useRef<HTMLInputElement>(null);
  const editRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showAddForm && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showAddForm]);

  useEffect(() => {
    if (editingId !== null && editRef.current) {
      editRef.current.focus();
    }
  }, [editingId]);

  const addTask = () => {
    if (newTask.trim()) {
      const task: Task = {
        id: Date.now(),
        text: newTask.trim(),
        completed: false,
        priority: newTaskPriority,
        category: newTaskCategory,
        dueDate: newTaskDate || new Date().toISOString().split('T')[0]
      };
      setTasks([task, ...tasks]);
      setNewTask('');
      setShowAddForm(false);
      setNewTaskPriority('medium');
      setNewTaskCategory('Personal');
      setNewTaskDate('');
    }
  };

  const toggleTask = (id: number) => {
    setTasks(tasks.map(task => 
      task.id === id ? { ...task, completed: !task.completed } : task
    ));
  };

  const deleteTask = (id: number) => {
    setTasks(tasks.filter(task => task.id !== id));
  };

  const startEdit = (id: number, text: string) => {
    setEditingId(id);
    setEditingText(text);
  };

  const saveEdit = () => {
    if (editingText.trim()) {
      setTasks(tasks.map(task => 
        task.id === editingId ? { ...task, text: editingText.trim() } : task
      ));
    }
    setEditingId(null);
    setEditingText('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingText('');
  };

  const getPriorityColor = (priority: Priority) => {
    switch (priority) {
      case 'high': return 'from-red-500/20 to-pink-500/20 border-red-200/30';
      case 'medium': return 'from-yellow-500/20 to-orange-500/20 border-yellow-200/30';
      case 'low': return 'from-green-500/20 to-emerald-500/20 border-green-200/30';
      default: return 'from-gray-500/20 to-slate-500/20 border-gray-200/30';
    }
  };

  const getPriorityIcon = (priority: Priority) => {
    switch (priority) {
      case 'high': return <Star className="w-3 h-3 text-red-400 fill-red-400" />;
      case 'medium': return <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />;
      case 'low': return <Star className="w-3 h-3 text-green-400" />;
      default: return null;
    }
  };

  const filteredTasks = tasks.filter(task => {
    const matchesFilter = filter === 'all' || 
      (filter === 'active' && !task.completed) || 
      (filter === 'completed' && task.completed);
    
    const matchesSearch = task.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
      task.category.toLowerCase().includes(searchQuery.toLowerCase());
    
    return matchesFilter && matchesSearch;
  });

  const completedCount = tasks.filter(task => task.completed).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 p-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="p-3 rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-600 shadow-lg">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-4xl font-black bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
              Focus
            </h1>
          </div>
          <p className="text-gray-600 font-medium">
            {tasks.length} tasks • {completedCount} completed
          </p>
        </div>

        {/* Search and Filter Bar */}
        <div className="backdrop-blur-xl bg-white/70 border border-white/20 rounded-2xl p-4 mb-6 shadow-xl">
          <div className="flex gap-3 mb-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search tasks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-white/50 border border-white/30 rounded-xl text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-300/50 focus:border-transparent transition-all"
              />
            </div>
            <button className="p-2.5 bg-white/50 border border-white/30 rounded-xl hover:bg-white/70 transition-all">
              <Filter className="w-4 h-4 text-gray-600" />
            </button>
          </div>
          
          <div className="flex gap-2">
            {(['all', 'active', 'completed'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                  filter === f 
                    ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/25' 
                    : 'text-gray-600 hover:bg-white/50'
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Add Task Button/Form */}
        {!showAddForm ? (
          <button
            onClick={() => setShowAddForm(true)}
            className="w-full backdrop-blur-xl bg-gradient-to-r from-indigo-500/90 to-purple-600/90 border border-white/20 rounded-2xl p-6 mb-6 shadow-xl hover:shadow-2xl hover:scale-[1.02] transition-all group"
          >
            <div className="flex items-center justify-center gap-3">
              <Plus className="w-6 h-6 text-white group-hover:rotate-180 transition-transform duration-300" />
              <span className="text-white font-semibold text-lg">Add New Task</span>
            </div>
          </button>
        ) : (
          <div className="backdrop-blur-xl bg-white/80 border border-white/30 rounded-2xl p-6 mb-6 shadow-xl">
            <input
              ref={inputRef}
              type="text"
              placeholder="What needs to be done?"
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && addTask()}
              className="w-full mb-4 px-0 py-2 text-lg bg-transparent border-0 border-b border-gray-200 text-gray-800 placeholder-gray-400 focus:outline-none focus:border-indigo-400 transition-colors"
            />
            
            <div className="flex gap-3 mb-4">
              <select
                value={newTaskPriority}
                onChange={(e) => setNewTaskPriority(e.target.value as Priority)}
                className="px-3 py-2 bg-white/50 border border-white/30 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300/50"
              >
                <option value="low">Low Priority</option>
                <option value="medium">Medium Priority</option>
                <option value="high">High Priority</option>
              </select>
              
              <input
                type="text"
                placeholder="Category"
                value={newTaskCategory}
                onChange={(e) => setNewTaskCategory(e.target.value)}
                className="px-3 py-2 bg-white/50 border border-white/30 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300/50"
              />
              
              <input
                type="date"
                value={newTaskDate}
                onChange={(e) => setNewTaskDate(e.target.value)}
                className="px-3 py-2 bg-white/50 border border-white/30 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300/50"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={addTask}
                className="px-6 py-2.5 bg-indigo-500 text-white rounded-xl font-semibold hover:bg-indigo-600 transition-colors"
              >
                Add Task
              </button>
              <button
                onClick={() => {
                  setShowAddForm(false);
                  setNewTask('');
                  setNewTaskPriority('medium');
                  setNewTaskCategory('Personal');
                  setNewTaskDate('');
                }}
                className="px-6 py-2.5 text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Task List */}
        <div className="space-y-3">
          {filteredTasks.map((task, index) => (
            <div
              key={task.id}
              className={`backdrop-blur-xl bg-gradient-to-r ${getPriorityColor(task.priority)} border rounded-2xl p-4 shadow-lg hover:shadow-xl transition-all duration-300 group ${
                task.completed ? 'opacity-60' : ''
              }`}
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div className="flex items-center gap-4">
                <button
                  onClick={() => toggleTask(task.id)}
                  className={`flex-shrink-0 w-6 h-6 rounded-full border-2 transition-all duration-200 ${
                    task.completed
                      ? 'bg-gradient-to-r from-green-400 to-emerald-500 border-green-400 shadow-lg shadow-green-400/25'
                      : 'border-gray-300 hover:border-indigo-400 hover:shadow-lg hover:shadow-indigo-400/25'
                  }`}
                >
                  {task.completed && <Check className="w-4 h-4 text-white mx-auto" />}
                </button>

                <div className="flex-1 min-w-0">
                  {editingId === task.id ? (
                    <input
                      ref={editRef}
                      type="text"
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && saveEdit()}
                      onBlur={saveEdit}
                      className="w-full bg-transparent border-0 border-b border-gray-300 focus:outline-none focus:border-indigo-400 text-gray-800 py-1"
                    />
                  ) : (
                    <div>
                      <h3 className={`font-semibold transition-all ${
                        task.completed ? 'line-through text-gray-500' : 'text-gray-800'
                      }`}>
                        {task.text}
                      </h3>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-white/50 rounded-lg text-xs font-medium text-gray-600">
                          {getPriorityIcon(task.priority)}
                          {task.category}
                        </span>
                        <span className="flex items-center gap-1 text-xs text-gray-500">
                          <Calendar className="w-3 h-3" />
                          {new Date(task.dueDate).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => startEdit(task.id, task.text)}
                    className="p-2 text-gray-400 hover:text-indigo-500 hover:bg-white/30 rounded-lg transition-all"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => deleteTask(task.id)}
                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-white/30 rounded-lg transition-all"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}

          {filteredTasks.length === 0 && (
            <div className="text-center py-12">
              <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-r from-gray-100 to-gray-200 rounded-full flex items-center justify-center">
                <Sparkles className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-600 mb-2">No tasks found</h3>
              <p className="text-gray-500">
                {searchQuery ? 'Try adjusting your search terms' : 'Add your first task to get started'}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center mt-12 text-gray-400 text-sm">
          Built with cutting-edge design principles
        </div>
      </div>
    </div>
  );
};

export default TodoApp;

