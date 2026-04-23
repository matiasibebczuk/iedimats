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

const TAG_COLORS = ['red', 'green', 'blue', 'yellow', 'purple', 'gray']

function getTagColor(tag) {
  let hash = 0
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash)
  }
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length]
}

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

  // 🔥 NUEVO
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

  // 🔥 HISTORIAL
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
      (m.tags || []).join(','),
      m.note || '',
      m.deleted_at
    ])

    const csv = [
      ['Title','Group','Type','Completed','Tags','Note','DeletedAt'],
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

  // 🔥 DELETE FIX
  async function handleDeleteMaterial(material) {
    if (!window.confirm('Eliminar?')) return

    await supabase
      .from('materials')
      .delete()
      .eq('id', material.id)

    setSelectedMaterial(null)
  }

  // 🔥 CLEAR + HISTORIAL
  async function handleClearGroup() {

    const toSave =
      selectedGroup === 'Todos'
        ? materials
        : materials.filter(m => m.group_name === selectedGroup)

    await supabase.from('materials_history').insert(
      toSave.map(m => ({
        title: m.title,
        group_name: m.group_name,
        type: m.type,
        completed: m.completed,
        tags: m.tags,
        note: m.note,
      }))
    )

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

  // 🔥 VISTA HISTORIAL
  if (viewHistory) {
    return (
      <div className="app-container">
        <div className="header">
          <h1 className="title">Historial - {selectedGroup}</h1>

          <button onClick={() => setViewHistory(false)} className="back-btn">
            ← Volver
          </button>

          <button
            onClick={() => exportHistoryCSV(historyData, selectedGroup)}
            className="clear-btn"
          >
            Descargar
          </button>
        </div>

        <div className="list">
          {historyData.map(h => (
            <div key={h.id} className="material-card">
              <div className="material-title">{h.title}</div>
              <div className="tags-row">
                <span>{h.type}</span>
                <span>{new Date(h.deleted_at).toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>

        <ToastContainer toasts={toasts} />
      </div>
    )
  }

  if (!selectedGroup) {
    return (
      <div className="screen-center">

        <div className="logo-container">
          <img src="/logonuevo.png" alt="logo" className="logo-img" />
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

        <ToastContainer toasts={toasts} />
      </div>
    )
  }

  return (
    <div className="app-container">

      <div className="header">
        <h1 className="title">{selectedGroup}</h1>

        <button onClick={fetchHistory} className="clear-btn">
          Historial
        </button>

        <button onClick={handleClearGroup} className="clear-btn">
          Limpiar grupo
        </button>

        <button onClick={() => setSelectedGroup(null)} className="back-btn">
          ← Volver
        </button>
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
