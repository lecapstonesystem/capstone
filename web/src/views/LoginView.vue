<template>
  <div class="min-h-screen bg-gray-100 flex items-center justify-center p-4">
    <div class="bg-white p-8 rounded-xl shadow-md w-full max-w-md">
      <!-- Header -->
      <div class="text-center mb-8">
        <h1 class="text-3xl font-bold text-green-700">UCMS</h1>
        <p class="text-gray-500 text-sm mt-1">Unified Cooperative Management System</p>
        <p class="text-gray-400 text-xs mt-1">Admin Portal</p>
      </div>

      <!-- Error Message -->
      <div
        v-if="error"
        class="bg-red-100 border border-red-300 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm"
      >
        {{ error }}
      </div>

      <!-- Reset sent confirmation -->
      <div
        v-if="resetSent"
        class="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg mb-4 text-sm"
      >
        If that email belongs to an account, a password reset link has been sent. Open the email and
        follow the link to set a new password. The link expires — request a new one if it is no
        longer there.
      </div>

      <!-- Forgot password — self-service emailed reset link -->
      <div v-if="showForgot" class="space-y-4">
        <div>
          <h2 class="text-sm font-semibold text-gray-800">Reset your password</h2>
          <p class="text-xs text-gray-500 mt-1">
            Enter the email address of your admin account. We will send a link to set a new
            password.
          </p>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1"> Email Address </label>
          <input
            v-model="forgotEmail"
            type="email"
            placeholder="Enter your email"
            class="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
        </div>
        <button
          @click="handleForgot"
          :disabled="forgotBusy"
          class="w-full bg-green-600 text-white py-2 rounded-lg font-medium hover:bg-green-700 transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {{ forgotBusy ? 'Sending...' : 'Send reset link' }}
        </button>
        <button
          @click="closeForgot"
          class="w-full text-center text-sm text-gray-500 hover:text-gray-700 transition duration-200"
        >
          Back to log in
        </button>
      </div>

      <!-- Form -->
      <div v-else class="space-y-4">
        <!-- Email -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1"> Email Address </label>
          <input
            v-model="email"
            type="email"
            placeholder="Enter your email"
            class="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            @focus="unlockPassword"
            @input="armForm"
          />
        </div>

        <!-- Password -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1"> Password </label>
          <div class="relative">
            <input
              ref="passwordInput"
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              :readonly="passwordReadonly"
              autocomplete="off"
              placeholder="Enter your password"
              class="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              @focus="armForm"
              @input="scrubPassword"
              @keydown="userEditedPassword = true"
              @paste="userEditedPassword = true"
              @cut="userEditedPassword = true"
            />
            <button
              @click="togglePassword"
              class="absolute right-3 top-2 text-gray-400 hover:text-gray-600 text-xs"
            >
              {{ showPassword ? 'Hide' : 'Show' }}
            </button>
          </div>
          <button
            @click="openForgot"
            class="text-xs font-medium text-green-700 hover:text-green-800 mt-1.5 transition duration-200"
          >
            Forgot password?
          </button>
        </div>

        <!-- Keep me signed in -->
        <label class="flex items-center gap-2 text-sm text-gray-600 select-none cursor-pointer">
          <input
            v-model="remember"
            type="checkbox"
            class="rounded border-gray-300 text-green-600 focus:ring-green-500"
          />
          Keep me signed in on this device
        </label>
        <p class="text-xs text-gray-400 -mt-2">
          Leave this unchecked on shared computers — you will be signed out when the browser closes.
        </p>

        <!-- Login Button -->
        <button
          @click="handleLogin"
          :disabled="loading"
          class="w-full bg-green-600 text-white py-2 rounded-lg font-medium hover:bg-green-700 transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed mt-2"
        >
          {{ loading ? 'Logging in...' : 'Log In' }}
        </button>
      </div>

      <!-- Footer -->
      <p class="text-center text-xs text-gray-400 mt-6">Authorized personnel only</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { getPersistMode } from '../lib/authStorage'

const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)
const showPassword = ref(false)
// Password field element — used by the scrub below.
const passwordInput = ref(null)
// True once a person has actually edited the field (keys, paste, cut).
// Password managers refill WITHOUT any of those events, so this is
// what tells deliberate entry apart from a phantom autofill.
const userEditedPassword = ref(false)

// Starts read-only: browsers skip read-only inputs when auto-filling
// on page load, so a saved password never lands on a shared screen
// before the admin has clicked anything.
const passwordReadonly = ref(true)

// Armed = a deliberate act has happened inside the form (a saved-login
// pick or typed entry in the email field, or focusing the password
// field). From that moment the password manager behaves like it does
// on other sites — picking the email's saved login fills the password
// along with it — while before the first click NOTHING is allowed to
// fill, because that state belongs to whoever used this computer last.
const formArmed = ref(false)

function unlockPassword() {
  passwordReadonly.value = false
  if (passwordInput.value) passwordInput.value.readOnly = false
}

function armForm() {
  formArmed.value = true
  unlockPassword()
}
// Pre-check from the last choice: staff who always stay signed in
// don't have to tick it every time.
const remember = ref(getPersistMode())
const router = useRouter()
const auth = useAuthStore()

// Self-service reset (adviser UAT #3) — email link only, same as the
// Admin Accounts reset; both run through the dedicated mail account.
const showForgot = ref(false)
const forgotEmail = ref('')
const forgotBusy = ref(false)
const resetSent = ref(false)

function openForgot() {
  error.value = ''
  resetSent.value = false
  forgotEmail.value = email.value.trim() // pre-fill what they already typed
  showForgot.value = true
}

function closeForgot() {
  error.value = ''
  resetSent.value = false
  showForgot.value = false
}

async function handleForgot() {
  error.value = ''
  const address = forgotEmail.value.trim().toLowerCase()
  if (!address || !address.includes('@') || !address.includes('.')) {
    error.value = 'Enter a valid email address.'
    return
  }
  forgotBusy.value = true
  // Same outcome either way on purpose: the message never confirms
  // whether an account exists (no account guessing from the login page).
  const result = await auth.forgotPassword(address)
  forgotBusy.value = false
  if (result.ok) {
    resetSent.value = true
    showForgot.value = false
  } else {
    error.value = result.message
  }
}

const handleLogin = async () => {
  // Basic validation
  if (!email.value || !password.value) {
    error.value = 'Please enter your email and password.'
    return
  }

  loading.value = true
  error.value = ''

  // Real Supabase Auth — bad credentials and unprovisioned accounts
  // come back as messages from the auth store.
  const result = await auth.signIn(email.value.trim().toLowerCase(), password.value, remember.value)
  if (result.ok) {
    router.push('/dashboard')
  } else {
    error.value = result.message
  }

  loading.value = false
}

// No phantom autofill may ever sit in the password field: the refs
// start empty, but a password saved in the browser's manager can
// refill the input the moment the page loads — or the moment its type
// changes under the Show/Hide toggle, which is how a stored credential
// could reappear in a cleared field. Skips once the form is armed (a
// deliberate pick or entry), while focused, and after real editing —
// so what the admin chose or typed is never wiped.
function scrubPassword() {
  const el = passwordInput.value
  if (!el || formArmed.value || userEditedPassword.value || document.activeElement === el) return
  el.value = ''
  password.value = ''
}

function togglePassword() {
  showPassword.value = !showPassword.value
  // Managers react to the type change itself — re-check right away
  // and once more shortly after the re-render settles.
  requestAnimationFrame(scrubPassword)
  setTimeout(scrubPassword, 400)
}

onMounted(() => {
  requestAnimationFrame(scrubPassword)
  setTimeout(scrubPassword, 600) // browsers autofill after load
})
</script>
