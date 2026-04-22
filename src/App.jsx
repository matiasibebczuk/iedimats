import { useEffect, useState } from 'react'
import { supabase } from './lib/supabaseClient'
import './App.css'

import {
  DndContext,
  closestCenter,
  useDraggable,
  useDroppable
} from '@dnd-kit/core'

const TYPES = ['geshuer', 'hacer', 'conseguir']

const GROUPS = [
  "Todos",
  "Recibimiento",
  "Eventos",
  "Nesha",
  "Jolma",
  "Leitza",
  "Nitza",
  "Jokrim",
  "Ietzira"
]

/* ===== AGRUPAR ===== */

function groupMaterials(materials) {
  const map = {}

  materials.forEach(m => {
    const key = (m.title || '').toLowerCase()

    if (!map[key]) {
      map[key] = { ...m, count: 1 }
    } else {
      map[key].count += 1
    }
  })

  return Object.values(map)
}

/* ===== DRAG ITEM ===== */

function DraggableItem({ material, toggle, setSelectedMaterial }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: material.id
  })

  const style = {
    transform: transform
      ? `translate(${transform.x}px, ${transform.y}px)`
      : undefined
  }

  return (
    <div ref={setNodeRef} style={style} className="material-card">

      <span onClick={() => setSelectedMaterial(material)}>
        {material.title}

        {material.count && material.count > 1 ? (
          <span style={{ marginLeft: 6, color: '#9ca3af' }}>
            x{material.count}
          </span>
        ) : null}
      </span>

      <div
        onClick={() => toggle(material)}
        className={`check ${material.completed ? 'done' : ''}`}
      />

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
  selectedGroup
}) {
  const { setNodeRef } = useDroppable({ id: type })

  let filtered = materials.filter(m => m.type === type)

  if (selectedGroup === "Todos") {
    filtered = groupMaterials(filtered)
  }

  return (
    <div ref={setNodeRef} className="column">
      <h2>{type}</h2>

      <div className="input-row">
        <input
          value={inputs[type]}
          onChange={(e) =>
            setInputs(prev => ({
              ...prev,
              [type]: e.target.value
            }))
          }
          placeholder="Agregar..."
        />

        <button onClick={() => addMaterial(type)}>+</button>
      </div>

      <div className="list">
        {filtered.map(m => (
          <DraggableItem
            key={m.id}
            material={m}
            toggle={toggle}
            setSelectedMaterial={setSelectedMaterial}
          />
        ))}
      </div>
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
    conseguir: ''
  })

  const [selectedMaterial, setSelectedMaterial] = useState(null)
  const [note, setNote] = useState('')

  useEffect(() => {
    fetchMaterials()

    const channel = supabase
      .channel('materials-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'materials' },
        (payload) => {

          if (payload.eventType === 'INSERT') {
            setMaterials(prev => [payload.new, ...prev])
          }

          if (payload.eventType === 'UPDATE') {
            setMaterials(prev =>
              prev.map(m =>
                m.id === payload.new.id ? payload.new : m
              )
            )
          }

          if (payload.eventType === 'DELETE') {
            setMaterials(prev =>
              prev.filter(m => m.id !== payload.old.id)
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
    }
  }, [selectedMaterial])

  async function fetchMaterials() {
    const { data } = await supabase.from('materials').select('*')
    setMaterials(data || [])
  }

  async function saveNote() {
    if (!selectedMaterial) return

    await supabase
      .from('materials')
      .update({ note })
      .eq('id', selectedMaterial.id)
  }

  async function addMaterial(type) {
    if (!inputs[type]) return

    await supabase.from('materials').insert({
      title: inputs[type],
      group_name: selectedGroup === "Todos" ? "Sin grupo" : selectedGroup,
      type
    })

    setInputs(prev => ({ ...prev, [type]: '' }))
  }

  async function toggle(material) {
    await supabase
      .from('materials')
      .update({ completed: !material.completed })
      .eq('id', material.id)
  }

  async function handleDragEnd(event) {
    const { active, over } = event
    if (!over) return

    await supabase
      .from('materials')
      .update({ type: over.id })
      .eq('id', active.id)
  }

  async function clearGroup() {
    if (selectedGroup === "Todos") {
      if (!window.confirm("¿Borrar TODO?")) return
      await supabase.from('materials').delete()
      return
    }

    if (!window.confirm("¿Borrar grupo?")) return

    await supabase
      .from('materials')
      .delete()
      .eq('group_name', selectedGroup)
  }

  /* ===== SCREEN 1 ===== */

  if (!selectedGroup) {
    return (
      <div className="screen-center">
        <h1 className="title-main">Elegí un grupo</h1>

        <div className="group-grid">
          {GROUPS.map(g => (
            <button
              key={g}
              onClick={() => setSelectedGroup(g)}
              className="group-button"
            >
              {g}
            </button>
          ))}
        </div>
      </div>
    )
  }

  /* ===== SCREEN 2 ===== */

  return (
    <div className="app-container">

      <div className="header">
        <h1 className="title">{selectedGroup}</h1>

        <button onClick={() => setSelectedGroup(null)} className="back-btn">
          ← Volver
        </button>
      </div>

      <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div className="board">

          {TYPES.map(type => (
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
                selectedGroup === "Todos"
                  ? materials
                  : materials.filter(m => m.group_name === selectedGroup)
              }
            />
          ))}

        </div>
      </DndContext>

      <div style={{ marginTop: 20, textAlign: 'center' }}>
        <button
          onClick={clearGroup}
          style={{
            background: '#dc2626',
            color: 'white',
            padding: '10px',
            borderRadius: '10px'
          }}
        >
          Vaciar todo
        </button>
      </div>

      {selectedMaterial && (
        <div
          className="popup-backdrop"
          onClick={() => {
            saveNote()
            setSelectedMaterial(null)
          }}
        >
          <div className="popup" onClick={(e) => e.stopPropagation()}>
            <h3>{selectedMaterial.title}</h3>

            <textarea
              className="note-area"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>
      )}

    </div>
  )
}

export default App
