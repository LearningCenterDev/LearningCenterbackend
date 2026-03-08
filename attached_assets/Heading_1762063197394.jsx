import React from 'react'
import { motion, useReducedMotion } from 'framer-motion'

/**
 * Heading - reusable section heading with gradient text and accessible animations.
 * Props:
 * - children: heading text
 * - gradient: Tailwind gradient classes (without bg-gradient-to-r)
 * - className: extra classes (font size, weight, etc.)
 * - center: boolean to center text
 */
export default function Heading({ children, gradient = 'from-blue-500 to-indigo-500', className = '', center = false }) {
  const shouldReduceMotion = useReducedMotion()

  const base = `bg-gradient-to-r ${gradient} bg-clip-text text-transparent`
  const align = center ? 'text-center' : ''

  const entrance = shouldReduceMotion
    ? undefined
    : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.6 } }

  const whileHover = shouldReduceMotion ? undefined : { scale: 1.05 }

  // Small CSS-only hover fallbacks (Tailwind classes) are applied when motion is enabled;
  // if reduced-motion is requested, hover transforms are omitted.
  const hoverClasses = shouldReduceMotion
    ? ''
    : 'transition transform duration-200 ease-out hover:tracking-wide filter hover:brightness-110 hover:drop-shadow-xl cursor-default'

  return (
    <motion.h2
      {...(entrance ?? {})}
      whileHover={whileHover}
      className={`${base} ${className} ${align} ${hoverClasses}`.trim()}
    >
      {children}
    </motion.h2>
  )
}
