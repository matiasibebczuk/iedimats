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

function SortableMaterialItem({ material, toggle, setSelectedMaterial }) {
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

  const [viewHistory, setViewHistory] = useState(false)
  const [historyData, setHistoryData] = useState([])

  const { toasts, addToast } = useToasts()

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
    let query = supabase
      .from('materials_history')
      .select('*')
      .order('deleted_at', { ascending: false })

    if (selectedGroup !== 'Todos') {
      query = query.eq('group_name', selectedGroup)
    }

    const { data } = await query
    setHistoryData(data || [])
    setViewHistory(true)
  }

  function exportHistoryCSV(data, name) {
    const rows = data.map(m => [
      m.title,
      m.group_name,
      m.type,
      m.completed ? 'Sí' : 'No',
      m.deleted_at
    ])

    const csv = [
      ['Title','Group','Type','Completed','DeletedAt'],
      ...rows
    ].map(r => r.join(',')).join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)

    const a = document.createElement('a')
    a.href = url
    a.download = `${name}-${new Date().toISOString()}.csv`
    a.click()
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

  async function handleDeleteMaterial(material) {
    if (!window.confirm('Eliminar?')) return

    await supabase
      .from('materials')
      .delete()
      .eq('id', material.id)
  }

  async function handleClearGroup() {

    const toSave =
      selectedGroup === 'Todos'
        ? materials
        : materials.filter(m => m.group_name === selectedGroup)

    await supabase.from('materials_history').insert(toSave)

    if (selectedGroup === 'Todos') {
      await supabase.from('materials').delete()
      return
    }

    await supabase
      .from('materials')
      .delete()
      .eq('group_name', selectedGroup)
  }

  async function handleDragEnd(event) {
    const { active, over } = event
    if (!over) return

    await supabase
      .from('materials')
      .update({ type: over.id })
      .eq('id', active.id)
  }

  if (viewHistory) {
    return (
      <div className="app-container">
        <div className="header">
          <h1>Historial - {selectedGroup}</h1>
          <button onClick={() => setViewHistory(false)}>←</button>
          <button onClick={() => exportHistoryCSV(historyData, selectedGroup)}>
            Descargar
          </button>
        </div>

        <div className="list">
          {historyData.map(h => (
            <div key={h.id} className="material-card">
              {h.title}
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (!selectedGroup) {
    return (
      <div className="screen-center">
        <h1>Elegí un grupo</h1>

        <div className="group-grid">
          {GROUPS.map((g) => (
            <button key={g} onClick={() => setSelectedGroup(g)}>
              {g}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="app-container">

      <div className="header">
        <h1>{selectedGroup}</h1>

        <button onClick={fetchHistory}>Historial</button>
        <button onClick={handleClearGroup}>Limpiar grupo</button>
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

      <ToastContainer toasts={toasts} />
    </div>
  )
}

export default App
