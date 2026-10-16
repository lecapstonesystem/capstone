<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-50 px-4">
    <div class="bg-white rounded-xl shadow-sm border border-gray-100 w-full max-w-md p-8">
      <h1 class="text-xl font-bold text-gray-800">
        {{ isRecovery ? 'Set a New Password' : 'Change Your Password' }}
      </h1>
      <p class="text-sm text-gray-500 mt-2">
        {{
          isRecovery
            ? 'Choose a new password for your account. You can then sign in with it right away.'
            : 'You were given a temporary password. Set your own password before using the portal.'
        }}
      </p>

      <div
        v-if="invalidLink"
        class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mt-6"
      >
        This reset link is invalid or has expired. Close this page, go to the sign-in screen, and
        ask for a new reset email.
      </div>

      <div
        v-else-if="error"
        class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mt-6"
      >
        {{ error }}
      </div>

      <form class="mt-6 space-y-4" @submit.prevent="submit">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">New password</label>
          <input
            v-model="password"
            type="password"
            autocomplete="new-password"
            class="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Confirm new password</label>
          <input
            v-model="confirmPassword"
            type="password"
            autocomplete="new-password"
            class="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
        </div>
        <p class="text-xs text-gray-400">Use at least 8 characters.</p>

        <button
          type="submit"
          :disabled="busy || invalidLink"
          class="w-full bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition duration-200 disabled:opacity-50"
        >
          {{ busy ? 'Saving...' : 'Set Password' }}
        </button>
      </form>

      <button
        v-if="isRecovery"
        type="button"
        class="w-full text-center text-xs text-gray-400 hover:text-gray-600 mt-5"
        @click="goToLogin"
      >
        Back to sign in
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/auth'

/**
 * One screen serves both password-setting moments:
 *
 *   /first-login  — a brand-new or reset admin signs in and still has
 *                   must_change_password on their row. The router
 *                   guard holds every other page hostage until this
 *                   form succeeds.
 *   /reset-password — landing page of Supabase's emailed reset link.
 *                   The link establishes a recovery session in the
 *                   URL; this form then sets the new password.
 *
 * Both paths call supabase.auth.updateUser(), which edits the signed-in
 * user's own password — no service key involved.
 */
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const isRecovery = computed(() => route.meta.mode === 'recovery')

const password = ref('')
const confirmPassword = ref('')
const error = ref('')
const busy = ref(false)
const invalidLink = ref(false)

async function submit() {
  error.value = ''
  invalidLink.value = false

  if (password.value.length < 8) {
    error.value = 'Password must be at least 8 characters.'
    return
  }
  if (password.value !== confirmPassword.value) {
    error.value = 'The two passwords do not match.'
    return
  }

  busy.value = true
  try {
    const result = await auth.changeOwnPassword(password.value)
    if (!result.ok) {
      // No usable session means the reset link was invalid or expired —
      // that is a link problem, not a password problem.
      if (result.invalidLink) {
        invalidLink.value = true
        return
      }
      error.value = result.message
      return
    }

    password.value = ''
    confirmPassword.value = ''

    if (isRecovery.value) {
      // Leave the recovery session behind — sign in fresh.
      await auth.signOut()
      router.push('/login')
    } else {
      // Flag is already cleared; the router guard lets every page through.
      router.push('/dashboard')
    }
  } finally {
    busy.value = false
  }
}

function goToLogin() {
  router.push('/login')
}

onMounted(async () => {
  if (!isRecovery.value) return
  // The reset link hands the session over in the URL. If none arrives,
  // the link was invalid or expired.
  const { data } = await supabase.auth.getSession()
  if (!data.session) invalidLink.value = true
})
</script>
