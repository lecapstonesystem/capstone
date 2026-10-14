<template>
  <div class="min-h-screen bg-gray-100 flex items-center justify-center">
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

      <!-- Form -->
      <div class="space-y-4">
        <!-- Email -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1"> Email Address </label>
          <input
            v-model="email"
            type="email"
            placeholder="Enter your email"
            class="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
        </div>

        <!-- Password -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1"> Password </label>
          <div class="relative">
            <input
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              placeholder="Enter your password"
              class="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
            <button
              @click="showPassword = !showPassword"
              class="absolute right-3 top-2 text-gray-400 hover:text-gray-600 text-xs"
            >
              {{ showPassword ? 'Hide' : 'Show' }}
            </button>
          </div>
        </div>

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
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)
const showPassword = ref(false)
const router = useRouter()
const auth = useAuthStore()

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
  const result = await auth.signIn(email.value.trim().toLowerCase(), password.value)
  if (result.ok) {
    router.push('/dashboard')
  } else {
    error.value = result.message
  }

  loading.value = false
}
</script>
