'use client'

import {
  createElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ElementType,
  type ReactNode,
} from 'react'
import { gsap } from 'gsap'
import './text-type.css'

export type TextTypeProps = {
  /** Text, or a list of texts to cycle through. */
  text: string | string[]
  /** HTML tag to render as. */
  as?: ElementType
  typingSpeed?: number
  initialDelay?: number
  /** Time to wait between typing and deleting. */
  pauseDuration?: number
  deletingSpeed?: number
  loop?: boolean
  className?: string
  showCursor?: boolean
  hideCursorWhileTyping?: boolean
  cursorCharacter?: ReactNode
  cursorClassName?: string
  cursorBlinkDuration?: number
  /** One colour per sentence; cycles alongside the text array. */
  textColors?: string[]
  /** Randomises typing speed within a range for a human feel. */
  variableSpeed?: { min: number; max: number }
  onSentenceComplete?: (sentence: string, index: number) => void
  /** Hold off until the element scrolls into view. */
  startOnVisible?: boolean
  reverseMode?: boolean
}

/** Types text out character by character, optionally cycling through a list. */
export default function TextType({
  text,
  as: Component = 'div',
  typingSpeed = 50,
  initialDelay = 0,
  pauseDuration = 2000,
  deletingSpeed = 30,
  loop = true,
  className = '',
  showCursor = true,
  hideCursorWhileTyping = false,
  cursorCharacter = '|',
  cursorClassName = '',
  cursorBlinkDuration = 0.5,
  textColors = [],
  variableSpeed,
  onSentenceComplete,
  startOnVisible = false,
  reverseMode = false,
}: TextTypeProps) {
  const [displayedText, setDisplayedText] = useState('')
  const [currentCharIndex, setCurrentCharIndex] = useState(0)
  const [isDeleting, setIsDeleting] = useState(false)
  const [currentTextIndex, setCurrentTextIndex] = useState(0)
  const [isVisible, setIsVisible] = useState(!startOnVisible)
  const cursorRef = useRef<HTMLSpanElement>(null)
  const containerRef = useRef<HTMLElement>(null)

  const textArray = useMemo(() => (Array.isArray(text) ? text : [text]), [text])

  const getRandomSpeed = useCallback(() => {
    if (!variableSpeed) return typingSpeed
    const { min, max } = variableSpeed
    return Math.random() * (max - min) + min
  }, [variableSpeed, typingSpeed])

  const currentColor = textColors.length
    ? textColors[currentTextIndex % textColors.length]
    : undefined

  useEffect(() => {
    if (!startOnVisible || !containerRef.current) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setIsVisible(true)
        })
      },
      { threshold: 0.1 },
    )

    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [startOnVisible])

  useEffect(() => {
    if (!showCursor || !cursorRef.current) return

    gsap.set(cursorRef.current, { opacity: 1 })
    const tween = gsap.to(cursorRef.current, {
      opacity: 0,
      duration: cursorBlinkDuration,
      repeat: -1,
      yoyo: true,
      ease: 'power2.inOut',
    })

    return () => {
      tween.kill()
    }
  }, [showCursor, cursorBlinkDuration])

  useEffect(() => {
    if (!isVisible) return

    const currentText = textArray[currentTextIndex]
    if (currentText === undefined) return

    const processedText = reverseMode ? [...currentText].reverse().join('') : currentText
    let timeout: ReturnType<typeof setTimeout> | undefined

    const run = () => {
      if (isDeleting) {
        if (displayedText === '') {
          setIsDeleting(false)
          if (currentTextIndex === textArray.length - 1 && !loop) return

          onSentenceComplete?.(currentText, currentTextIndex)
          setCurrentTextIndex((prev) => (prev + 1) % textArray.length)
          setCurrentCharIndex(0)
          return
        }

        timeout = setTimeout(() => {
          setDisplayedText((prev) => prev.slice(0, -1))
        }, deletingSpeed)
        return
      }

      if (currentCharIndex < processedText.length) {
        timeout = setTimeout(
          () => {
            setDisplayedText((prev) => prev + processedText.charAt(currentCharIndex))
            setCurrentCharIndex((prev) => prev + 1)
          },
          variableSpeed ? getRandomSpeed() : typingSpeed,
        )
        return
      }

      if (!loop && currentTextIndex === textArray.length - 1) return
      if (textArray.length === 1 && !loop) return

      timeout = setTimeout(() => setIsDeleting(true), pauseDuration)
    }

    if (currentCharIndex === 0 && !isDeleting && displayedText === '') {
      timeout = setTimeout(run, initialDelay)
    } else {
      run()
    }

    return () => clearTimeout(timeout)
  }, [
    currentCharIndex,
    displayedText,
    isDeleting,
    typingSpeed,
    deletingSpeed,
    pauseDuration,
    textArray,
    currentTextIndex,
    loop,
    initialDelay,
    isVisible,
    reverseMode,
    variableSpeed,
    getRandomSpeed,
    onSentenceComplete,
  ])

  const activeText = textArray[currentTextIndex] ?? ''
  const shouldHideCursor =
    hideCursorWhileTyping && (currentCharIndex < activeText.length || isDeleting)

  return createElement(
    Component,
    { ref: containerRef, className: `text-type ${className}`.trim() },
    <span className="text-type__content" style={currentColor ? { color: currentColor } : undefined}>
      {displayedText}
    </span>,
    showCursor && (
      <span
        ref={cursorRef}
        className={`text-type__cursor ${cursorClassName} ${
          shouldHideCursor ? 'text-type__cursor--hidden' : ''
        }`.trim()}
      >
        {cursorCharacter}
      </span>
    ),
  )
}
