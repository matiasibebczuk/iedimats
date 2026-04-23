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

/* ===== ITEM ===== */

function SortableMaterialItem({ material, toggle }) {
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
      <div className="material-title">{material.title}</div>
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
          onKeyDown={(e) => e.key === 'Enter' && addMaterial(type)}
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

  const [viewHistory, setViewHistory] = useState(false)
  const [historyData, setHistoryData] = useState([])

  const { toasts } = useToasts()

  const sensors = useSensors(useSensor(PointerSensor))

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

  async function fetchMaterials() {
    const { data } = await supabase.from('materials').select('*')
    setMaterials(data || [])
  }

  async function fetchHistory() {
    const { data } = await supabase
      .from('materials_history')
      .select('*')
      .order('deleted_at', { ascending: false })

    setHistoryData(data || [])
    setViewHistory(true)
  }

  async function addMaterial(type) {
    if (!inputs[type]) return

    await supabase.from('materials').insert({
      title: inputs[type],
      group_name: selectedGroup,
      type,
      completed: false,
    })

    setInputs((prev) => ({ ...prev, [type]: '' }))
  }

  async function toggle(material) {
    await supabase
      .from('materials')
      .update({ completed: !material.completed })
      .eq('id', material.id)
  }

  async function handleClearGroup() {
    await supabase.from('materials').delete().eq('group_name', selectedGroup)
  }

  async function handleDragEnd(event) {
    const { active, over } = event
    if (!over) return

    await supabase
      .from('materials')
      .update({ type: over.id })
      .eq('id', active.id)
  }

  /* ===== HISTORY VIEW ===== */

  if (viewHistory) {
    return (
      <div className="app-container">
        <div className="header">
          <h1 className="title">Historial</h1>

          <div className="header-actions">
            <button className="back-btn" onClick={() => setViewHistory(false)}>
              ← Volver
            </button>
          </div>
        </div>

        <div className="list">
          {historyData.map((h) => (
            <div key={h.id} className="material-card">
              {h.title}
            </div>
          ))}
        </div>
      </div>
    )
  }

  /* ===== GROUP SELECT ===== */

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

          {/* 🔥 BOTÓN TODOS (ARREGLADO) */}
          <button
            onClick={() => setSelectedGroup('Todos')}
            className="group-button todos-button-pro"
          >
            Todos
          </button>
        </div>

        <ToastContainer toasts={toasts} />
      </div>
    )
  }

  /* ===== MAIN ===== */

  return (
    <div className="app-container">

      <div className="header">
        <h1 className="title">{selectedGroup}</h1>

        {/* 🔥 HEADER PRO */}
        <div className="header-actions">
          <button className="clear-btn" onClick={fetchHistory}>
            Historial
          </button>

          <button className="clear-btn" onClick={handleClearGroup}>
            Limpiar
          </button>

          <button
            className="back-btn"
            onClick={() => setSelectedGroup(null)}
          >
            ←
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
              materials={
                selectedGroup === 'Todos'
                  ? materials
                  : materials.filter(
                      (m) => m.group_name === selectedGroup
                    )
              }
            />
          ))}
        </div>
      </DndContext>

      <ToastContainer toasts={toasts} />
    </div>
  )
}

export default App
