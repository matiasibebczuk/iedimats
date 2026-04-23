import { useEffect, useState, useCallback } from 'react'
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

/* ===== TAG COLORS ===== */

const TAG_COLORS = ['red', 'green', 'blue', 'yellow', 'purple', 'gray']

function getTagColor(tag) {
  let hash = 0
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash)
  }
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length]
}

/* ===== TOAST ===== */

let toastIdCounter = 0

function useToasts() {
  const [toasts, setToasts] = useState([])

  const addToast = useCallback((message, type = 'info') => {
    const id = ++toastIdCounter
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 3000)
  }, [])

  return { toasts, addToast }
}

function ToastContainer({ toasts }) {
  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.type}`}>
          {t.message}
        </div>
      ))}
    </div>
  )
}

/* ===== SORTABLE ITEM ===== */

function SortableMaterialItem({
  material,
  toggle,
  setSelectedMaterial,
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: material.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div ref={setNodeRef} style={style} className="material-card">

      <div
        onClick={() => toggle(material)}
        className={`check ${material.completed ? 'done' : ''}`}
      />

      <div
        className="material-title"
        onClick={() => setSelectedMaterial(material)}
      >
        {material.title}
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
}) {
  const { setNodeRef } = useDroppable({ id: type })

  const filtered = materials.filter((m) => m.type === type)
  const ids = filtered.map((m) => m.id)

  return (
    <div ref={setNodeRef} className="column">
      <h2>{type}</h2>

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
        />
        <button onClick={() => addMaterial(type)}>+</button>
      </div>

      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div className="list">
          {filtered.map((m) => (
            <SortableMaterialItem
              key={m.id}
              material={m}
              toggle={toggle}
              setSelectedMaterial={setSelectedMaterial}
            />
          ))}
        </div>
      </SortableContext>
    </div>
  )
}

/* ===== APP ===== */

function App() {
  const [materials, setMaterials] = useState([])
  const [selectedGroup, setSelectedGroup] = useState(null)

  const [inputs, setInputs] = useState({
    geshuer: '',
    hacer: '',
    conseguir: '',
  })

  const [selectedMaterial, setSelectedMaterial] = useState(null)
  const [note, setNote] = useState('')
  const [editTitle, setEditTitle] = useState('')

  const { toasts, addToast } = useToasts()

  const sensors = useSensors(useSensor(PointerSensor))

  /* ===== FETCH ===== */

  async function fetchMaterials() {
    const { data } = await supabase.from('materials').select('*')
    setMaterials(data || [])
  }

  useEffect(() => {
    fetchMaterials()

    const channel = supabase
      .channel('materials')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'materials' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setMaterials((prev) => [payload.new, ...prev])
          }
          if (payload.eventType === 'UPDATE') {
            setMaterials((prev) =>
              prev.map((m) =>
                m.id === payload.new.id ? payload.new : m
              )
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
    }
  }, [selectedMaterial])

  /* ===== ACTIONS ===== */

  async function addMaterial(type) {
    if (!inputs[type].trim()) return

    const { error } = await supabase.from('materials').insert({
      title: inputs[type].trim(),
      group_name: selectedGroup,
      type,
      completed: false,
    })

    if (!error) {
      setInputs((prev) => ({ ...prev, [type]: '' }))
      addToast('Material agregado', 'success')
    }
  }

  async function toggle(material) {
    await supabase
      .from('materials')
      .update({ completed: !material.completed })
      .eq('id', material.id)
  }

  async function saveChanges() {
    if (!selectedMaterial) return

    await supabase
      .from('materials')
      .update({
        title: editTitle,
        note,
      })
      .eq('id', selectedMaterial.id)

    addToast('Guardado', 'success')
  }

  async function deleteMaterial(material) {
    if (!window.confirm('Eliminar?')) return

    const { error } = await supabase
      .from('materials')
      .delete()
      .eq('id', material.id)

    if (!error) {
      setSelectedMaterial(null)
      addToast('Eliminado', 'success')
    }
  }

  async function handleDragEnd(event) {
    const { active, over } = event
    if (!over) return

    const activeId = active.id
    const overId = over.id

    const activeItem = materials.find((m) => m.id === activeId)
    const overItem = materials.find((m) => m.id === overId)

    if (!activeItem || !overItem) return

    if (activeItem.type !== overItem.type) {
      await supabase
        .from('materials')
        .update({ type: overItem.type })
        .eq('id', activeId)
    }
  }

  /* ===== SCREEN 1 ===== */

  if (!selectedGroup) {
    return (
      <div className="screen-center">

        <div className="logo-container">
          <div className="logo-img">
            <img src="/logonuevo.png" alt="logo" />
          </div>
          
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
        </div>

        <ToastContainer toasts={toasts} />
      </div>
    )
  }

  /* ===== SCREEN 2 ===== */

  return (
    <div className="app-container">

      <div className="header">
        <h1>{selectedGroup}</h1>
        <button onClick={() => setSelectedGroup(null)}>←</button>
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
              materials={materials.filter(
                (m) => m.group_name === selectedGroup
              )}
            />
          ))}
        </div>
      </DndContext>

      {selectedMaterial && (
        <div
          className="popup-backdrop"
          onClick={() => {
            saveChanges()
            setSelectedMaterial(null)
          }}
        >
          <div className="popup" onClick={(e) => e.stopPropagation()}>

            <input
              className="title-input"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
            />

            <textarea
              className="note-area"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />

            <button
              onClick={() => deleteMaterial(selectedMaterial)}
              className="delete-btn"
            >
              Eliminar
            </button>

          </div>
        </div>
      )}

      <ToastContainer toasts={toasts} />
    </div>
  )
}

export default App
