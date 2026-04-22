import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from './lib/supabaseClient'
import './App.css'

import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
} from '@dnd-kit/core'

import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'

import { CSS } from '@dnd-kit/utilities'

const TYPES = ['geshuer', 'hacer', 'conseguir']

const GROUPS = [
  'Recibimiento',
  'Eventos',
  'Nesha',
  'Jolma',
  'Leitza',
  'Nitza',
  'Jokrim',
  'Ietzira',
]

/* ===== TAG COLOR MAP ===== */
const TAG_COLORS = [
  'red', 'green', 'blue', 'yellow', 'purple', 'gray'
]

function getTagColor(tag) {
  let hash = 0
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash)
  }
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length]
}

/* ===== TOAST SYSTEM ===== */

let toastIdCounter = 0

function useToasts() {
  const [toasts, setToasts] = useState([])

  const addToast = useCallback((message, type = 'info', onUndo = null) => {
    const id = ++toastIdCounter
    setToasts((prev) => [...prev, { id, message, type, onUndo }])
    return id
  }, [])

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return { toasts, addToast, removeToast }
}

function ToastContainer({ toasts, removeToast }) {
  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast ${toast.type}`}>
          <span className="toast-message">{toast.message}</span>
          {toast.onUndo && (
            <button
              className="toast-undo"
              onClick={() => {
                toast.onUndo()
                removeToast(toast.id)
              }}
            >
              Deshacer
            </button>
          )}
          <button
            className="toast-close"
            onClick={() => removeToast(toast.id)}
          >
            &times;
          </button>
        </div>
      ))}
    </div>
  )
}

/* ===== AGRUPAR (solo visual) ===== */

function groupMaterials(materials) {
  const map = {}
  materials.forEach((m) => {
    const key = (m.title || '').toLowerCase()
    if (!map[key]) {
      map[key] = { ...m, count: 1, _ids: [m.id] }
    } else {
      map[key].count += 1
      map[key]._ids.push(m.id)
    }
  })
  return Object.values(map)
}

/* ===== SORTABLE ITEM ===== */

function SortableMaterialItem({
  material,
  toggle,
  setSelectedMaterial,
  isGrouped,
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: material.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`material-card ${material.completed ? 'completed' : ''} ${
        isDragging ? 'dragging' : ''
      }`}
    >
      {!isGrouped && (
        <div
          onClick={() => toggle(material)}
          className={`check ${material.completed ? 'done' : ''}`}
        />
      )}

      <div
        className="material-title"
        onClick={() => setSelectedMaterial(material)}
      >
        <span className="material-title-text">
          {material.title}
          {isGrouped && material.count > 1 && (
            <span className="grouped-count">x{material.count}</span>
          )}
        </span>
        {!isGrouped && material.tags && material.tags.length > 0 && (
          <div className="tags-row">
            {material.tags.map((tag) => (
              <span key={tag} className={`tag-chip tag-${getTagColor(tag)}`}>
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      <div {...listeners} {...attributes} className="drag-area" />
    </div>
  )
}

/* ===== COLUMN ===== */

function Column({
  type,
  materials,
  inputs,
  setInputs,
  addMaterial,
  toggle,
  setSelectedMaterial,
  selectedGroup,
}) {
  const { setNodeRef } = useDroppable({ id: type })

  let filtered = materials.filter((m) => m.type === type)

  let displayList = filtered

  if (selectedGroup === 'Todos') {
    displayList = groupMaterials(filtered)
  }

  const itemIds = displayList.map((m) => m.id)

  return (
    <div ref={setNodeRef} className="column">
      <h2>
        {type}
        <span className="column-count">{filtered.length}</span>
      </h2>

      <div className="input-row">
        <input
          value={inputs[type]}
          onChange={(e) =>
            setInputs((prev) => ({
              ...prev,
              [type]: e.target.value,
            }))
          }
          onKeyDown={(e) => {
            if (e.key === 'Enter') addMaterial(type)
          }}
          placeholder="Agregar..."
        />
        <button onClick={() => addMaterial(type)}>+</button>
      </div>

      <div className="list">
        <SortableContext
          items={itemIds}
          strategy={verticalListSortingStrategy}
        >
          {displayList.length === 0 ? (
            <div className="empty-state">No hay materiales</div>
          ) : (
            displayList.map((m) => (
              <SortableMaterialItem
                key={m.id}
                material={m}
                toggle={toggle}
                setSelectedMaterial={setSelectedMaterial}
                isGrouped={selectedGroup === 'Todos'}
              />
            ))
          )}
        </SortableContext>
      </div>
    </div>
  )
}

/* ===== MAIN APP ===== */

function App() {
  const [materials, setMaterials] = useState([])
  const [selectedGroup, setSelectedGroup] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  const [inputs, setInputs] = useState({
    geshuer: '',
    hacer: '',
    conseguir: '',
  })

  const [selectedMaterial, setSelectedMaterial] = useState(null)
  const [note, setNote] = useState('')
  const [editTitle, setEditTitle] = useState('')
  const [editTags, setEditTags] = useState([])
  const [newTagInput, setNewTagInput] = useState('')

  const { toasts, addToast, removeToast } = useToasts()
  const pendingDeletions = useRef({})

  /* ===== SENSORS ===== */

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  )

  /* ===== FETCH ===== */

  async function fetchMaterials() {
    setIsLoading(true)
    const { data } = await supabase
      .from('materials')
      .select('*')
      .order('position', { ascending: true })
      .order('created_at', { ascending: false })
    setMaterials(data || [])
    setIsLoading(false)
  }

  useEffect(() => {
    fetchMaterials()

    const channel = supabase
      .channel('materials-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'materials' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setMaterials((prev) => [payload.new, ...prev])
          }
          if (payload.eventType === 'UPDATE') {
            setMaterials((prev) =>
              prev.map((m) => (m.id === payload.new.id ? payload.new : m))
            )
          }
          if (payload.eventType === 'DELETE') {
            setMaterials((prev) =>
              prev.filter((m) => m.id !== payload.old.id)
            )
          }
        }
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [])

  useEffect(() => {
    if (selectedMaterial) {
      setNote(selectedMaterial.note || '')
      setEditTitle(selectedMaterial.title || '')
      setEditTags(selectedMaterial.tags || [])
      setNewTagInput('')
    }
  }, [selectedMaterial])

  /* ===== MATERIAL OPERATIONS ===== */

  async function saveChanges() {
    if (!selectedMaterial) return
    await supabase
      .from('materials')
      .update({
        note,
        title: editTitle,
        tags: editTags,
      })
      .eq('id', selectedMaterial.id)
    addToast('Cambios guardados', 'success')
  }

  function handleDeleteMaterial(material) {
    const deletionKey = Date.now()
    pendingDeletions.current[deletionKey] = material

    // Remove visually immediately
    setMaterials((prev) => prev.filter((m) => m.id !== material.id))
    setSelectedMaterial(null)

    const toastId = addToast('Material eliminado', 'warning', () => {
      // UNDO
      setMaterials((prev) => [...prev, material])
      delete pendingDeletions.current[deletionKey]
      removeToast(toastId)
    })

    setTimeout(() => {
      if (pendingDeletions.current[deletionKey]) {
        supabase.from('materials').delete().eq('id', material.id)
        delete pendingDeletions.current[deletionKey]
        removeToast(toastId)
      }
    }, 5000)
  }

async function addMaterial(type) {
  if (!inputs[type].trim()) return

  const { error } = await supabase.from('materials').insert({
    title: inputs[type].trim(),
    group_name: selectedGroup === 'Todos' ? 'Sin grupo' : selectedGroup,
    type,
    completed: false,
    note: '',
    tags: []
  })

  if (error) {
    console.error("INSERT ERROR:", error)
    addToast('Error al agregar material', 'error')
    return
  }

  setInputs((prev) => ({ ...prev, [type]: '' }))
  addToast('Material agregado', 'success')
}

  async function toggle(material) {
    await supabase
      .from('materials')
      .update({ completed: !material.completed })
      .eq('id', material.id)
  }

  /* ===== TAG OPERATIONS ===== */

  function addTag() {
    const tag = newTagInput.trim().toLowerCase()
    if (!tag) return
    if (editTags.includes(tag)) {
      setNewTagInput('')
      return
    }
    setEditTags((prev) => [...prev, tag])
    setNewTagInput('')
  }

  function removeTag(tag) {
    setEditTags((prev) => prev.filter((t) => t !== tag))
  }

  /* ===== DRAG & DROP ===== */

  async function handleDragEnd(event) {
    const { active, over } = event
    if (!over) return

    const activeId = active.id
    const overId = over.id

    const activeMaterial = materials.find((m) => m.id === activeId)
    if (!activeMaterial) return

    // Dropped on a column (different type)
    if (TYPES.includes(overId)) {
      if (activeMaterial.type !== overId) {
        await supabase
          .from('materials')
          .update({ type: overId })
          .eq('id', activeId)
        addToast(`Movido a "${overId}"`, 'success')
      }
      return
    }

    // Dropped on another item
    const overMaterial = materials.find((m) => m.id === overId)
    if (!overMaterial) return

    if (activeMaterial.type !== overMaterial.type) {
      // Moved to different column
      await supabase
        .from('materials')
        .update({ type: overMaterial.type })
        .eq('id', activeId)
      addToast(`Movido a "${overMaterial.type}"`, 'success')
    } else {
      // Reordered within same column
      const columnMaterials = materials
        .filter((m) => m.type === activeMaterial.type)
        .sort((a, b) => (a.position || 0) - (b.position || 0))

      const oldIndex = columnMaterials.findIndex((m) => m.id === activeId)
      const newIndex = columnMaterials.findIndex((m) => m.id === overId)

      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        const reordered = arrayMove(columnMaterials, oldIndex, newIndex)

        // Update positions locally
        const updatedMaterials = materials.map((m) => {
          const idx = reordered.findIndex((r) => r.id === m.id)
          if (idx !== -1) {
            return { ...m, position: idx }
          }
          return m
        })
        setMaterials(updatedMaterials)

        // Persist to Supabase
        try {
          await Promise.all(
            reordered.map((m, i) =>
              supabase
                .from('materials')
                .update({ position: i })
                .eq('id', m.id)
            )
          )
        } catch {
          // position column might not exist
        }
      }
    }
  }

  /* ===== CLEAR GROUP ===== */

  function handleClearGroup() {
    if (selectedGroup === 'Todos') {
      const toastId = addToast('Todos los materiales eliminados', 'warning', () => {
        // Cannot undo "delete all" easily, so just remove toast
        removeToast(toastId)
      })
      supabase.from('materials').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      return
    }

    const groupMaterials = materials.filter((m) => m.group_name === selectedGroup)
    const deletionKey = Date.now()
    pendingDeletions.current[deletionKey] = groupMaterials

    setMaterials((prev) => prev.filter((m) => m.group_name !== selectedGroup))

    const toastId = addToast(`Grupo "${selectedGroup}" eliminado`, 'warning', () => {
      setMaterials((prev) => [...prev, ...groupMaterials])
      delete pendingDeletions.current[deletionKey]
      removeToast(toastId)
    })

    setTimeout(() => {
      if (pendingDeletions.current[deletionKey]) {
        supabase.from('materials').delete().eq('group_name', selectedGroup)
        delete pendingDeletions.current[deletionKey]
        removeToast(toastId)
      }
    }, 5000)
  }

  /* ===== FILTERED MATERIALS ===== */

  const filteredMaterials = searchQuery.trim()
    ? materials.filter((m) =>
        (m.title || '').toLowerCase().includes(searchQuery.toLowerCase())
      )
    : materials

  /* ===== LOADING SCREEN ===== */

  if (isLoading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <span>Cargando materiales...</span>
      </div>
    )
  }

  /* ===== SCREEN 1: GROUP SELECTOR ===== */

  if (!selectedGroup) {
    return (
    <div className="screen-center">

      {/* LOGO */}
      <div className="logo-container">
        <img src="/file_00000000843071f590de9fbd803d102d.png" alt="IEDI-MATS" className="logo-img" />
      </div>

      <h1 className="title-main">Elegí un grupo</h1>
        <div className="group-grid">
          {GROUPS.map((g) => (
            <button
              key={g}
              onClick={() => setSelectedGroup(g)}
              className="group-button"
            >
              {g}
            </button>
          ))}
          <button
            onClick={() => setSelectedGroup('Todos')}
            className="group-button todos-button-pro"
          >
            Todos
          </button>
        </div>
        <ToastContainer toasts={toasts} removeToast={removeToast} />
      </div>
    )
  }

  /* ===== SCREEN 2: KANBAN BOARD ===== */

  return (
    <div className="app-container">
      <div className="header">
        <h1 className="title">{selectedGroup}</h1>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            className="search-bar"
            placeholder="Buscar materiales..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <button onClick={handleClearGroup} className="clear-btn">
            Limpiar grupo
          </button>
          <button onClick={() => setSelectedGroup(null)} className="back-btn">
            ← Volver
          </button>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <div className="board">
          {TYPES.map((type) => (
            <Column
              key={type}
              type={type}
              inputs={inputs}
              setInputs={setInputs}
              addMaterial={addMaterial}
              toggle={toggle}
              setSelectedMaterial={setSelectedMaterial}
              selectedGroup={selectedGroup}
              materials={
                selectedGroup === 'Todos'
                  ? filteredMaterials
                  : filteredMaterials.filter(
                      (m) => m.group_name === selectedGroup
                    )
              }
            />
          ))}
        </div>
      </DndContext>

      {/* ===== POPUP ===== */}

      {selectedMaterial && (
        <div
          className="popup-backdrop"
          onClick={() => {
            saveChanges()
            setSelectedMaterial(null)
          }}
        >
          <div className="popup" onClick={(e) => e.stopPropagation()}>
            <div className="popup-header">
              <h3>Editar material</h3>
              <button
                className="back-btn"
                style={{ padding: '4px 8px', fontSize: '12px' }}
                onClick={() => {
                  saveChanges()
                  setSelectedMaterial(null)
                }}
              >
                ✕
              </button>
            </div>

            <input
              className="title-input"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder="Título..."
            />

            <label className="completed-toggle">
              <div
                onClick={() => toggle(selectedMaterial)}
                className={`check ${selectedMaterial.completed ? 'done' : ''}`}
              />
              <span>
                {selectedMaterial.completed ? 'Completado' : 'Pendiente'}
              </span>
            </label>

            <textarea
              className="note-area"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Notas..."
            />

            {/* ===== TAGS SECTION ===== */}
            <div className="tags-section-label">Etiquetas</div>
            <div className="tags-container">
              {editTags.map((tag) => (
                <span
                  key={tag}
                  className={`tag-item tag-${getTagColor(tag)}`}
                >
                  {tag}
                  <button onClick={() => removeTag(tag)}>&times;</button>
                </span>
              ))}
            </div>
            <div className="tag-input-row">
              <input
                value={newTagInput}
                onChange={(e) => setNewTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addTag()
                }}
                placeholder="Nueva etiqueta..."
              />
              <button onClick={addTag}>+</button>
            </div>

            <div className="popup-actions">
              <button
                onClick={() => handleDeleteMaterial(selectedMaterial)}
                className="delete-btn"
              >
                Eliminar
              </button>
              <button
                onClick={() => {
                  saveChanges()
                  setSelectedMaterial(null)
                }}
                className="save-btn"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </div>
  )
}

export default App
