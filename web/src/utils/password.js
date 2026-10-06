/**
 * Shared password generator for account provisioning.
 * No 0/O/1/I/l — avoids confusion when read aloud or written by hand.
 */
export function randomPassword(length = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  let password = ''
  for (let i = 0; i < length; i += 1) {
    password += chars[Math.floor(Math.random() * chars.length)]
  }
  return password
}
