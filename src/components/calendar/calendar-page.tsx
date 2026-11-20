'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { api } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ReservationFormDialog } from './reservation-form-dialog'
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  User,
  XCircle,
  CalendarDays,
  CircleDot,
  CheckCircle2,
} from 'lucide-react'
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  isSameMonth,
  isToday,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek,
  addDays,
  getDate,
} from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'
import { notifyError } from '@/components/ui/error-alert'
import { motion, AnimatePresence } from 'framer-motion'
import {
  agendaWeekDays,
  computeFreeGaps,
  dayKey,
  groupByDay,
  minutesFromMidnight,
  minutesToLabel,
  weekRangeLabel,
  type AgendaItem,
} from '@/lib/agenda-vistas'

interface Reservation extends AgendaItem {
  description?: string | null
  serviceType?: string | null
  notes?: string | null
  client?: { id: string; name: string; phone?: string; email?: string } | null
}

type AgendaView = 'mes' | 'semana' | 'dia'

const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

/** Ventana del día visible en la vista Día: 07:00–21:00. */
const DAY_VIEW_START = 7 * 60
const DAY_VIEW_END = 21 * 60
const HOUR_HEIGHT = 56

const VIEW_LABELS: Record<AgendaView, string> = { mes: 'Mes', semana: 'Semana', dia: 'Día' }

const statusConfig: Record<string, { bg: string; text: string; label: string; dot: string; border: string }> = {
  confirmed: { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Confirmada', dot: 'bg-emerald-500', border: 'border-emerald-200' },
  cancelled: { bg: 'bg-red-50', text: 'text-red-600', label: 'Cancelada', dot: 'bg-red-400', border: 'border-red-200' },
  completed: { bg: 'bg-slate-50', text: 'text-slate-600', label: 'Completada', dot: 'bg-slate-400', border: 'border-slate-200' },
  no_show: { bg: 'bg-amber-50', text: 'text-amber-700', label: 'No asistió', dot: 'bg-amber-400', border: 'border-amber-200' },
}

export function CalendarPage() {
  const [view, setView] = useState<AgendaView>('mes')
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [formDefaults, setFormDefaults] = useState<{ date?: Date; time?: string }>({})

  const weekDays = useMemo(() => agendaWeekDays(selectedDate), [selectedDate])

  const loadReservations = useCallback(async () => {
    try {
      // El rango descargado depende de la vista activa.
      let start: Date
      let end: Date
      if (view === 'mes') {
        start = startOfMonth(currentMonth)
        end = endOfMonth(currentMonth)
      } else if (view === 'semana') {
        start = weekDays[0]
        end = weekDays[6]
      } else {
        start = selectedDate
        end = selectedDate
      }
      const data = await api.getReservations({
        startDate: format(start, 'yyyy-MM-dd'),
        endDate: format(end, 'yyyy-MM-dd'),
        limit: '200',
      })
      setReservations(data.reservations as Reservation[])
    } catch {
      notifyError({}, 'No se pudieron cargar las reservas')
    } finally {
      setLoading(false)
    }
  }, [view, currentMonth, weekDays, selectedDate])

  useEffect(() => {
    loadReservations()
  }, [loadReservations])

  const groupedByDay = useMemo(() => groupByDay(reservations), [reservations])

  const selectedDayReservations = useMemo(
    () => groupedByDay.get(dayKey(selectedDate)) ?? [],
    [groupedByDay, selectedDate],
  )

  const getReservationsForDay = (day: Date) => groupedByDay.get(dayKey(day)) ?? []

  // Generate all days for the month grid
  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
  const allDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd })

  const goToPrev = () => {
    if (view === 'mes') setCurrentMonth((m) => subMonths(m, 1))
    else if (view === 'semana') setSelectedDate((d) => addDays(d, -7))
    else setSelectedDate((d) => addDays(d, -1))
  }
  const goToNext = () => {
    if (view === 'mes') setCurrentMonth((m) => addMonths(m, 1))
    else if (view === 'semana') setSelectedDate((d) => addDays(d, 7))
    else setSelectedDate((d) => addDays(d, 1))
  }
  const goToToday = () => {
    setCurrentMonth(new Date())
    setSelectedDate(new Date())
  }

  const openFormAt = (date: Date, time?: string) => {
    setFormDefaults({ date, time })
    setShowForm(true)
  }

  const periodTitle =
    view === 'mes'
      ? format(currentMonth, 'MMMM yyyy', { locale: es })
      : view === 'semana'
        ? weekRangeLabel(weekDays)
        : format(selectedDate, "d 'de' MMMM yyyy", { locale: es })

  // Count reservations by status
  const confirmedCount = reservations.filter(r => r.status === 'confirmed').length
  const completedCount = reservations.filter(r => r.status === 'completed').length

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] gap-3">
      {/* Header Bar */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Calendario</h1>
          <p className="text-sm text-slate-500 mt-0.5">Gestiona tus reservas y citas</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Quick Stats */}
          <div className="hidden sm:flex items-center gap-3 mr-2">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              {confirmedCount} confirmadas
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <div className="w-2 h-2 rounded-full bg-slate-400" />
              {completedCount} completadas
            </div>
          </div>
          {/* View switcher (F4) */}
          <div className="flex items-center rounded-lg border border-slate-200 bg-white p-0.5">
            {(['mes', 'semana', 'dia'] as AgendaView[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-2.5 h-7 text-xs font-semibold rounded-md transition-colors ${
                  view === v ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                {VIEW_LABELS[v]}
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={goToToday}
            className="text-xs h-8 gap-1.5"
          >
            <CircleDot className="w-3.5 h-3.5" />
            Hoy
          </Button>
          <Button
            onClick={() => openFormAt(selectedDate)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-xs gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" /> Nueva Reserva
          </Button>
        </div>
      </div>

      {/* Main Calendar Layout - fills all available space */}
      <div className={`flex-1 grid grid-cols-1 ${view === 'semana' ? '' : 'lg:grid-cols-[1fr_320px]'} gap-3 min-h-0`}>
        {/* Calendar Grid Card - fills the container */}
        <Card className="border-0 shadow-sm flex flex-col min-h-0 overflow-hidden">
          <CardContent className="flex-1 flex flex-col p-0 min-h-0">
            {/* Period Navigation */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 flex-shrink-0">
              <div className="flex items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={goToPrev}
                  className="h-7 w-7 text-slate-400 hover:text-slate-900 hover:bg-slate-100"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={goToNext}
                  className="h-7 w-7 text-slate-400 hover:text-slate-900 hover:bg-slate-100"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
              <h2 className="text-sm font-bold text-slate-900 tracking-tight capitalize">
                {periodTitle}
              </h2>
              <Badge variant="outline" className="text-[13px] px-2 py-0 h-5 border-slate-200 text-slate-500">
                {reservations.length} reservas
              </Badge>
            </div>

            {/* Views */}
            <div className="flex-1 min-h-0">
              {view === 'mes' && (
                <MonthView
                  allDays={allDays}
                  currentMonth={currentMonth}
                  selectedDate={selectedDate}
                  onSelectDay={setSelectedDate}
                  getReservationsForDay={getReservationsForDay}
                />
              )}
              {view === 'semana' && (
                <WeekView
                  days={weekDays}
                  groupedByDay={groupedByDay}
                  loading={loading}
                  onSelectDay={(d) => { setSelectedDate(d); setView('dia') }}
                  onOpenForm={openFormAt}
                />
              )}
              {view === 'dia' && (
                <DayView
                  day={selectedDate}
                  items={selectedDayReservations}
                  loading={loading}
                  onOpenForm={openFormAt}
                />
              )}
            </div>
          </CardContent>
        </Card>

        {/* Right Panel - Selected Day Detail (mes y día) */}
        {view !== 'semana' && (
          <div className="flex flex-col gap-3 min-h-0">
            {/* Selected Day Header */}
            <Card className="border-0 shadow-sm flex-shrink-0">
              <CardContent className="p-3.5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[13px] text-slate-400 uppercase tracking-widest font-bold">
                      {selectedDate ? format(selectedDate, 'EEEE', { locale: es }) : ''}
                    </p>
                    <h3 className="text-lg font-bold text-slate-900 capitalize mt-0.5 leading-tight">
                      {selectedDate
                        ? format(selectedDate, "d 'de' MMMM", { locale: es })
                        : 'Selecciona un día'}
                    </h3>
                  </div>
                  {selectedDate && (
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                      <CalendarDays className="w-5 h-5 text-emerald-600" />
                    </div>
                  )}
                </div>

                {selectedDayReservations.length > 0 && (
                  <div className="flex items-center gap-2 mt-2.5 pt-2.5 border-t border-slate-100">
                    <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[13px] h-5">
                      {selectedDayReservations.length} {selectedDayReservations.length === 1 ? 'reserva' : 'reservas'}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 text-[13px] text-emerald-600 hover:text-emerald-700 gap-0.5 px-1.5"
                      onClick={() => openFormAt(selectedDate)}
                    >
                      <Plus className="w-2.5 h-2.5" /> Agregar
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Reservations List for Selected Day */}
            <Card className="border-0 shadow-sm flex-1 flex flex-col min-h-0 overflow-hidden">
              <CardContent className="flex-1 overflow-y-auto p-2.5">
                {loading ? (
                  <div className="space-y-2">
                    {[...Array(3)].map((_, i) => (
                      <Skeleton key={i} className="h-16 rounded-lg" />
                    ))}
                  </div>
                ) : selectedDayReservations.length > 0 ? (
                  <AnimatePresence mode="popLayout">
                    <div className="space-y-1.5">
                      {selectedDayReservations
                        .map((res, idx) => (
                          <motion.div
                            key={res.id}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -6 }}
                            transition={{ duration: 0.15, delay: idx * 0.04 }}
                          >
                            <ReservationMiniCard
                              reservation={res}
                              onUpdate={loadReservations}
                            />
                          </motion.div>
                        ))}
                    </div>
                  </AnimatePresence>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-center py-4">
                    <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center mb-2">
                      <CalendarDays className="w-6 h-6 text-slate-300" />
                    </div>
                    <p className="text-xs font-medium text-slate-400">Sin reservas</p>
                    <p className="text-[13px] text-slate-300 mt-0.5">Este día no tiene citas</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2 text-[13px] h-6 gap-1 border-dashed"
                      onClick={() => openFormAt(selectedDate)}
                    >
                      <Plus className="w-2.5 h-2.5" /> Agendar
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Reservation Form */}
      <ReservationFormDialog
        open={showForm}
        onClose={() => { setShowForm(false); setFormDefaults({}); loadReservations() }}
        defaultDate={formDefaults.date ?? selectedDate}
        defaultTime={formDefaults.time}
      />
    </div>
  )
}

/* ──── Vista Mes (original) ──── */
function MonthView({
  allDays,
  currentMonth,
  selectedDate,
  onSelectDay,
  getReservationsForDay,
}: {
  allDays: Date[]
  currentMonth: Date
  selectedDate: Date
  onSelectDay: (d: Date) => void
  getReservationsForDay: (d: Date) => Reservation[]
}) {
  return (
    <div className="flex flex-col p-2 h-full min-h-0">
      {/* Weekday Headers */}
      <div className="grid grid-cols-7 gap-0.5 mb-0.5 flex-shrink-0">
        {WEEKDAY_LABELS.map((day) => (
          <div
            key={day}
            className="text-center text-[13px] font-bold text-slate-400 uppercase tracking-widest py-1.5"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Day Cells - fill all remaining height */}
      <div className="flex-1 grid grid-cols-7 auto-rows-fr gap-0.5 min-h-0">
        {allDays.map((day, idx) => {
          const dayReservations = getReservationsForDay(day)
          const hasReservations = dayReservations.length > 0
          const isCurrentMonth = isSameMonth(day, currentMonth)
          const isSelected = isSameDay(day, selectedDate)
          const isTodayDate = isToday(day)

          return (
            <motion.button
              key={idx}
              onClick={() => onSelectDay(day)}
              whileHover={{ scale: 1.015 }}
              whileTap={{ scale: 0.985 }}
              className={`
                        relative flex flex-col items-center justify-start pt-2 rounded-lg transition-all duration-150 overflow-hidden
                        ${!isCurrentMonth ? 'opacity-25' : ''}
                        ${isSelected
                          ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20 ring-2 ring-emerald-400/30'
                          : isTodayDate
                            ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-300'
                            : hasReservations
                              ? 'bg-emerald-50/50 text-slate-900 hover:bg-emerald-100/60'
                              : 'text-slate-600 hover:bg-slate-50'
                        }
                      `}
            >
              <span className={`
                        text-xs font-bold leading-none
                        ${isSelected ? 'text-white' : isTodayDate ? 'text-emerald-700' : ''}
                      `}>
                {getDate(day)}
              </span>

              {/* Reservation indicators */}
              {hasReservations && !isSelected && (
                <div className="flex flex-col items-center gap-0.5 mt-1.5 px-0.5 w-full">
                  {dayReservations.slice(0, 2).map((res, i) => {
                    const sc = statusConfig[res.status] ?? statusConfig.confirmed
                    return (
                      <div
                        key={i}
                        className={`w-full h-1 rounded-full ${sc.dot} opacity-60`}
                      />
                    )
                  })}
                  {dayReservations.length > 2 && (
                    <span className="text-[8px] text-slate-400 leading-none">+{dayReservations.length - 2}</span>
                  )}
                </div>
              )}

              {/* Selected day: white dots */}
              {hasReservations && isSelected && (
                <div className="flex items-center gap-0.5 mt-1">
                  {dayReservations.slice(0, 3).map((_, i) => (
                    <div key={i} className="w-1 h-1 rounded-full bg-white/60" />
                  ))}
                </div>
              )}
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}

/* ──── Vista Semana (F4): 7 columnas con citas y huecos libres ──── */
function WeekView({
  days,
  groupedByDay,
  loading,
  onSelectDay,
  onOpenForm,
}: {
  days: Date[]
  groupedByDay: Map<string, Reservation[]>
  loading: boolean
  onSelectDay: (d: Date) => void
  onOpenForm: (date: Date, time?: string) => void
}) {
  return (
    <div className="flex flex-col p-2 h-full min-h-0">
      <div className="grid grid-cols-7 gap-1 h-full min-h-0">
        {days.map((day) => {
          const key = dayKey(day)
          const items = groupedByDay.get(key) ?? []
          const gaps = computeFreeGaps(
            items.map((i) => ({
              start: minutesFromMidnight(new Date(i.date)),
              end: minutesFromMidnight(new Date(i.date)) + (i.duration || 60),
              status: i.status,
            })),
          )
          const isTodayDate = isToday(day)

          return (
            <div key={key} className="flex flex-col min-h-0 rounded-lg border border-slate-100 overflow-hidden">
              {/* Day header */}
              <button
                onClick={() => onSelectDay(day)}
                className={`flex items-center justify-center gap-1.5 py-1.5 flex-shrink-0 transition-colors ${
                  isTodayDate ? 'bg-emerald-50 hover:bg-emerald-100' : 'bg-slate-50/60 hover:bg-slate-100'
                }`}
              >
                <span className={`text-[13px] font-bold uppercase tracking-widest ${isTodayDate ? 'text-emerald-700' : 'text-slate-400'}`}>
                  {format(day, 'EEE', { locale: es })}
                </span>
                <span className={`text-xs font-bold ${isTodayDate ? 'text-emerald-700' : 'text-slate-600'}`}>
                  {getDate(day)}
                </span>
              </button>

              {/* Items + gaps */}
              <div className="flex-1 overflow-y-auto p-1 space-y-1 min-h-0">
                {loading ? (
                  <Skeleton className="h-10 rounded-md" />
                ) : (
                  <>
                    {items.map((res) => {
                      const sc = statusConfig[res.status] ?? statusConfig.confirmed
                      const start = new Date(res.date)
                      return (
                        <button
                          key={res.id}
                          onClick={() => onSelectDay(day)}
                          className={`w-full text-left rounded-md p-1.5 border ${sc.bg} ${sc.border} hover:shadow-sm transition-all`}
                        >
                          <div className="flex items-center gap-1">
                            <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${sc.dot}`} />
                            <span className="text-[13px] font-bold text-slate-700">{format(start, 'HH:mm')}</span>
                            <span className="text-[13px] text-slate-400">{res.duration}m</span>
                          </div>
                          <p className="text-[13px] font-semibold text-slate-800 truncate mt-0.5 leading-tight">
                            {res.title}
                          </p>
                          {res.client?.name && (
                            <p className="text-[13px] text-slate-400 truncate">{res.client.name}</p>
                          )}
                        </button>
                      )
                    })}
                    {gaps.map((g) => (
                      <button
                        key={`${key}-gap-${g.startMinutes}`}
                        onClick={() => onOpenForm(day, minutesToLabel(g.startMinutes))}
                        className="w-full text-left rounded-md px-1.5 py-1 border border-dashed border-slate-200 text-slate-400 hover:border-emerald-300 hover:text-emerald-600 hover:bg-emerald-50/40 transition-all"
                        title="Crear cita en este hueco"
                      >
                        <span className="text-[13px] font-semibold">
                          Libre {minutesToLabel(g.startMinutes)}–{minutesToLabel(g.endMinutes)}
                        </span>
                      </button>
                    ))}
                    {items.length === 0 && gaps.length === 0 && (
                      <p className="text-[13px] text-slate-300 text-center py-2">Sin huecos</p>
                    )}
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ──── Vista Día (F4): línea de tiempo con duración y huecos ──── */
function DayView({
  day,
  items,
  loading,
  onOpenForm,
}: {
  day: Date
  items: Reservation[]
  loading: boolean
  onOpenForm: (date: Date, time?: string) => void
}) {
  const active = items.filter((i) => i.status !== 'cancelled')
  const gaps = computeFreeGaps(
    active.map((i) => ({
      start: minutesFromMidnight(new Date(i.date)),
      end: minutesFromMidnight(new Date(i.date)) + (i.duration || 60),
      status: i.status,
    })),
    { dayStart: DAY_VIEW_START, dayEnd: DAY_VIEW_END },
  )
  const totalHeight = ((DAY_VIEW_END - DAY_VIEW_START) / 60) * HOUR_HEIGHT
  const hours = Array.from({ length: (DAY_VIEW_END - DAY_VIEW_START) / 60 + 1 }, (_, i) => DAY_VIEW_START + i * 60)

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const minutes = DAY_VIEW_START + Math.round(((e.clientY - rect.top) / HOUR_HEIGHT) * 60 / 30) * 30
    if (minutes < DAY_VIEW_START || minutes > DAY_VIEW_END) return
    onOpenForm(day, minutesToLabel(minutes))
  }

  return (
    <div className="flex h-full min-h-0">
      {/* Timeline */}
      <div className="flex-1 overflow-y-auto p-2 min-h-0">
        {loading ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-12 rounded-lg" />
            ))}
          </div>
        ) : (
          <div className="flex">
            {/* Hour labels */}
            <div className="w-12 flex-shrink-0 pt-1">
              {hours.slice(0, -1).map((h) => (
                <div key={h} className="text-[13px] font-semibold text-slate-400 text-right pr-2" style={{ height: HOUR_HEIGHT }}>
                  {minutesToLabel(h)}
                </div>
              ))}
            </div>
            {/* Grid + blocks */}
            <div
              className="flex-1 relative border-l border-slate-100 cursor-pointer"
              style={{ height: totalHeight }}
              onClick={handleTimelineClick}
            >
              {hours.slice(0, -1).map((h) => (
                <div key={h} className="absolute left-0 right-0 border-t border-slate-100" style={{ top: ((h - DAY_VIEW_START) / 60) * HOUR_HEIGHT }} />
              ))}
              {active.map((res) => {
                const sc = statusConfig[res.status] ?? statusConfig.confirmed
                const startMin = minutesFromMidnight(new Date(res.date))
                const top = ((startMin - DAY_VIEW_START) / 60) * HOUR_HEIGHT
                const height = Math.max(((res.duration || 60) / 60) * HOUR_HEIGHT - 2, 30)
                if (startMin + (res.duration || 60) <= DAY_VIEW_START || startMin >= DAY_VIEW_END) return null
                return (
                  <div
                    key={res.id}
                    onClick={(e) => { e.stopPropagation(); onOpenForm(day) }}
                    className={`absolute left-1 right-2 rounded-lg border p-2 ${sc.bg} ${sc.border} hover:shadow-md transition-all overflow-hidden`}
                    style={{ top: Math.max(top, 0), height }}
                    title={`${minutesToLabel(startMin)}–${minutesToLabel(startMin + (res.duration || 60))} · ${res.duration} min`}
                  >
                    <div className="flex items-center gap-1.5">
                      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${sc.dot}`} />
                      <span className="text-[13px] font-bold text-slate-700">
                        {minutesToLabel(startMin)}–{minutesToLabel(startMin + (res.duration || 60))}
                      </span>
                      <Badge className={`text-[8px] h-4 px-1 border-0 ${sc.bg} ${sc.text} font-medium`}>
                        {sc.label}
                      </Badge>
                    </div>
                    <p className="text-xs font-bold text-slate-900 truncate mt-0.5 leading-tight">{res.title}</p>
                    {res.client?.name && (
                      <p className="text-[13px] text-slate-500 truncate flex items-center gap-0.5">
                        <User className="w-2.5 h-2.5 flex-shrink-0" /> {res.client.name}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Free gaps sidebar */}
      <div className="w-44 flex-shrink-0 border-l border-slate-100 p-2 overflow-y-auto">
        <p className="text-[13px] font-bold text-slate-400 uppercase tracking-widest px-1 mb-1.5">
          Huecos libres
        </p>
        {loading ? (
          <Skeleton className="h-8 rounded-md" />
        ) : gaps.length > 0 ? (
          <div className="space-y-1">
            {gaps.map((g) => (
              <button
                key={`day-gap-${g.startMinutes}`}
                onClick={() => onOpenForm(day, minutesToLabel(g.startMinutes))}
                className="w-full text-left rounded-md px-2 py-1.5 border border-dashed border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/40 transition-all"
                title="Crear cita en este hueco"
              >
                <span className="text-[13px] font-semibold text-slate-500">
                  {minutesToLabel(g.startMinutes)}–{minutesToLabel(g.endMinutes)}
                </span>
                <span className="text-[13px] text-slate-400 block">{g.minutes} min libres</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-[13px] text-slate-300 px-1">Día completo, sin huecos</p>
        )}
        <button
          onClick={() => onOpenForm(day)}
          className="mt-2 w-full flex items-center justify-center gap-1 rounded-md px-2 py-1.5 bg-emerald-600 text-white text-[13px] font-semibold hover:bg-emerald-700 transition-colors"
        >
          <Plus className="w-3 h-3" /> Nueva cita
        </button>
      </div>
    </div>
  )
}

/* ──── Compact reservation card for the side panel ──── */
function ReservationMiniCard({ reservation, onUpdate }: { reservation: Reservation; onUpdate: () => void }) {
  const handleCancel = async () => {
    try {
      await api.cancelReservation(reservation.id)
      toast.success('Reserva cancelada')
      onUpdate()
    } catch {
      notifyError({}, 'No se pudo cancelar la reserva')
    }
  }

  const handleMarkComplete = async () => {
    try {
      await api.updateReservation(reservation.id, { status: 'completed' })
      toast.success('Reserva completada')
      onUpdate()
    } catch {
      notifyError({}, 'No se pudo actualizar la reserva')
    }
  }

  const st = statusConfig[reservation.status] ?? statusConfig.confirmed

  return (
    <div className={`rounded-lg p-2.5 ${st.bg} border ${st.border} hover:shadow-sm transition-all duration-150`}>
      <div className="flex items-start justify-between gap-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1 ${st.dot}`} />
          <div className="min-w-0">
            <h4 className="text-xs font-bold text-slate-900 truncate leading-tight">{reservation.title}</h4>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[13px] text-slate-500 flex items-center gap-0.5">
                <Clock className="w-2.5 h-2.5" />
                {format(new Date(reservation.date), 'HH:mm', { locale: es })} · {reservation.duration}min
              </span>
            </div>
          </div>
        </div>
        <Badge className={`text-[8px] h-4 px-1 border-0 ${st.bg} ${st.text} font-medium`}>
          {st.label}
        </Badge>
      </div>

      {/* Extra details */}
      {(reservation.client || reservation.location) && (
        <div className="flex flex-wrap gap-x-2.5 gap-y-0 mt-1.5 ml-3">
          {reservation.client && (
            <span className="text-[13px] text-slate-500 flex items-center gap-0.5">
              <User className="w-2.5 h-2.5" />
              {reservation.client.name}
            </span>
          )}
          {reservation.location && (
            <span className="text-[13px] text-slate-500 flex items-center gap-0.5 truncate">
              <MapPin className="w-2.5 h-2.5 flex-shrink-0" />
              <span className="truncate">{reservation.location}</span>
            </span>
          )}
        </div>
      )}

      {/* Actions for confirmed */}
      {reservation.status === 'confirmed' && (
        <div className="flex gap-3 mt-1.5 ml-3 pt-1.5 border-t border-black/5">
          <button
            onClick={handleMarkComplete}
            className="text-[13px] font-semibold text-emerald-600 hover:text-emerald-800 transition-colors flex items-center gap-0.5"
          >
            <CheckCircle2 className="w-2.5 h-2.5" /> Completar
          </button>
          <button
            onClick={handleCancel}
            className="text-[13px] font-semibold text-red-400 hover:text-red-600 transition-colors flex items-center gap-0.5"
          >
            <XCircle className="w-2.5 h-2.5" /> Cancelar
          </button>
        </div>
      )}
    </div>
  )
}
