import type { LGraphNode } from "@/LGraphNode"
import type { IKnobWidget, IWidgetKnobOptions } from "@/types/widgets"

import { LGraphCanvas } from "@/LGraphCanvas"
import { clamp } from "@/litegraph"
import { CanvasMouseEvent } from "@/types/events"

import { BaseWidget } from "./BaseWidget"

export class KnobWidget extends BaseWidget implements IKnobWidget {
  declare type: "knob"
  declare value: number
  declare options: IWidgetKnobOptions

  constructor(widget: IKnobWidget) {
    super(widget)
    this.type = "knob"
    this.value = widget.value
    this.options = widget.options
  }

  computedHeight?: number
  /**
   * Compute the layout size of the widget.
   * @returns The layout size of the widget.
   */
  computeLayoutSize(): {
    minHeight: number
    maxHeight?: number
    minWidth: number
    maxWidth?: number
  } {
    return {
      minHeight: 60,
      minWidth: 20,
      maxHeight: 1000000,
      maxWidth: 1000000,
    }
  }

  get height(): number {
    return this.computedHeight || super.height
  }

  drawWidget(
    ctx: CanvasRenderingContext2D,
    options: {
      y: number
      width: number
      show_text?: boolean
      margin?: number
      gradient_stops?: string
    },
  ): void {
    // Store original context attributes
    const originalTextAlign = ctx.textAlign
    const originalStrokeStyle = ctx.strokeStyle
    const originalFillStyle = ctx.fillStyle

    const { y, width: widget_width, show_text = true, margin = 15 } = options
    const { gradient_stops = "rgb(14, 182, 201); rgb(0, 216, 72)" } = this.options
    const effective_height = this.computedHeight || this.height
    // Draw background
    const size_modifier =
      Math.min(this.computedHeight || this.height, this.width || 20) / 20 // TODO: replace magic numbers
    const arc_center = { x: widget_width / 2, y: effective_height / 2 + y }
    ctx.lineWidth =
      (Math.min(widget_width, effective_height) - margin * size_modifier) / 6
    const arc_size =
      (Math.min(widget_width, effective_height) -
        margin * size_modifier -
        ctx.lineWidth) / 2
    {
      const gradient = ctx.createRadialGradient(
        arc_center.x,
        arc_center.y,
        arc_size + ctx.lineWidth,
        0,
        0,
        arc_size + ctx.lineWidth,
      )
      gradient.addColorStop(0, "rgb(29, 29, 29)")
      gradient.addColorStop(1, "rgb(116, 116, 116)")
      ctx.fillStyle = gradient
    }
    ctx.beginPath()

    {
      ctx.arc(
        arc_center.x,
        arc_center.y,
        arc_size + ctx.lineWidth / 2,
        0,
        Math.PI * 2,
        false,
      )
      ctx.fill()
      ctx.closePath()
    }

    // Draw knob's background
    const arc = {
      start_angle: Math.PI * 0.6,
      end_angle: Math.PI * 2.4,
    }
    ctx.beginPath()
    {
      const gradient = ctx.createRadialGradient(
        arc_center.x,
        arc_center.y,
        arc_size + ctx.lineWidth,
        0,
        0,
        arc_size + ctx.lineWidth,
      )
      gradient.addColorStop(0, "rgb(99, 99, 99)")
      gradient.addColorStop(1, "rgb(36, 36, 36)")
      ctx.strokeStyle = gradient
    }
    ctx.arc(
      arc_center.x,
      arc_center.y,
      arc_size,
      arc.start_angle,
      arc.end_angle,
      false,
    )
    ctx.stroke()
    ctx.closePath()

    const range = this.options.max - this.options.min
    let nvalue = (this.value - this.options.min) / range
    nvalue = clamp(nvalue, 0, 1)

    // Draw value
    ctx.beginPath()
    const gradient = ctx.createConicGradient(
      arc.start_angle,
      arc_center.x,
      arc_center.y,
    )
    const gs = gradient_stops.split(";")
    gs.forEach((stop, index) => {
      console.log(stop)
      gradient.addColorStop(index, stop.trim())
    })

    ctx.strokeStyle = gradient
    const value_end_angle =
      (arc.end_angle - arc.start_angle) * nvalue + arc.start_angle
    ctx.arc(
      arc_center.x,
      arc_center.y,
      arc_size,
      arc.start_angle,
      value_end_angle,
      false,
    )
    ctx.stroke()
    ctx.closePath()

    // Draw outline if not disabled
    if (show_text && !this.disabled) {
      ctx.strokeStyle = this.outline_color
      // Draw value
      ctx.beginPath()
      ctx.strokeStyle = this.outline_color
      ctx.arc(
        arc_center.x,
        arc_center.y,
        arc_size + ctx.lineWidth / 2,
        0,
        Math.PI * 2,
        false,
      )
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.closePath()
    }

    // Draw marker if present
    // TODO: TBD later when options work

    // Draw text
    if (show_text) {
      ctx.textAlign = "center"
      ctx.fillStyle = this.text_color
      ctx.fillText(
        (this.label || this.name) +
        "\n" +
        Number(this.value).toFixed(
          this.options.precision != null ? this.options.precision : 3,
        ),
        widget_width * 0.5,
        y + effective_height * 0.5,
      )
    }

    // Restore original context attributes
    ctx.textAlign = originalTextAlign
    ctx.strokeStyle = originalStrokeStyle
    ctx.fillStyle = originalFillStyle
  }

  onClick(): void {
    this.current_drag_offset = 0
  }

  current_drag_offset = 0
  override onDrag(options: {
    e: CanvasMouseEvent
    node: LGraphNode
    canvas: LGraphCanvas
  }): void {
    if (this.options.read_only) return
    const { e } = options
    const step = this.options.step
    // Shift to move by 10% increments, there is no division by 10 due to the front-end multiplier
    const maxMinDifference = (this.options.max - this.options.min)
    const maxMinDifference10pct = maxMinDifference / 10
    const step_for = {
      delta_x: step,
      shift: maxMinDifference > step ? maxMinDifference - (maxMinDifference % step) : step,
      delta_y: maxMinDifference10pct > step ? maxMinDifference10pct - (maxMinDifference10pct % step) : step, // 1% increments
    }

    const use_y = Math.abs(e.movementY) > Math.abs(e.movementX)
    const delta = use_y ? -e.movementY : e.movementX // Y is inverted so that UP increases the value
    const drag_threshold = 15
    // Calculate new value based on drag movement
    this.current_drag_offset += delta
    let adjustment = 0
    if (this.current_drag_offset > drag_threshold) {
      adjustment += 1
      this.current_drag_offset -= drag_threshold
    } else if (this.current_drag_offset < -drag_threshold) {
      adjustment -= 1
      this.current_drag_offset += drag_threshold
    }

    const step_with_shift_modifier = e.shiftKey
      ? step_for.shift
      : use_y
        ? step_for.delta_y
        : step
    // HACK: For some reason, the front-end multiplies step by 10, this brings it down to the advertised value
    // SEE: src/utils/mathUtil.ts@getNumberDefaults in front end
    const deltaValue = adjustment * step_with_shift_modifier / 10
    const newValue = clamp(
      this.value + deltaValue,
      this.options.min,
      this.options.max,
    )
    if (newValue !== this.value) {
      this.setValue(newValue, options)
    }
  }
}
