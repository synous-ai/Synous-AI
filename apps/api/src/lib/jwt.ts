import jwt from 'jsonwebtoken'
import { env } from '../config/env'
import { Errors } from './errors'

export interface AccessTokenPayload {
  sub: string // hub_user.id (CUID2)
  portalId: string
  role: string
  type: 'access'
}

export interface RefreshTokenPayload {
  sub: string
  portalId: string
  type: 'refresh'
}

export function signAccessToken(payload: Omit<AccessTokenPayload, 'type'>): string {
  return jwt.sign({ ...payload, type: 'access' }, env.ACCESS_TOKEN_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL,
  } as jwt.SignOptions)
}

export function signRefreshToken(payload: Omit<RefreshTokenPayload, 'type'>): string {
  return jwt.sign({ ...payload, type: 'refresh' }, env.REFRESH_TOKEN_SECRET, {
    expiresIn: env.REFRESH_TOKEN_TTL,
  } as jwt.SignOptions)
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, env.ACCESS_TOKEN_SECRET) as unknown as AccessTokenPayload
    if (decoded.type !== 'access') throw Errors.unauthorized('Tipo de token inválido')
    return decoded
  } catch {
    throw Errors.unauthorized('Token de acceso inválido o expirado')
  }
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  try {
    const decoded = jwt.verify(token, env.REFRESH_TOKEN_SECRET) as unknown as RefreshTokenPayload
    if (decoded.type !== 'refresh') throw Errors.unauthorized('Tipo de token inválido')
    return decoded
  } catch {
    throw Errors.unauthorized('Refresh token inválido o expirado')
  }
}
