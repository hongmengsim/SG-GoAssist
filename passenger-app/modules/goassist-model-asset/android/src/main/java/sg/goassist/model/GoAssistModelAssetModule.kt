package sg.goassist.model

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileInputStream
import java.security.MessageDigest

class GoAssistModelAssetModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("GoAssistModelAsset")

    AsyncFunction("getModelPath") {
      val context = appContext.reactContext
        ?: throw IllegalStateException("Android application context is unavailable")
      val modelName = "Qwen3-0.6B-Q8_0.gguf"
      val expectedSha256 = "9465e63a22add5354d9bb4b99e90117043c7124007664907259bd16d043bb031"
      val modelDir = File(context.filesDir, "goassist-ai-model")
      val modelFile = File(modelDir, modelName)
      modelDir.mkdirs()

      if (!modelFile.exists() || sha256(modelFile) != expectedSha256) {
        val temporary = File(modelDir, "$modelName.partial")
        if (temporary.exists()) temporary.delete()
        context.assets.open("goassist_ai_model/$modelName").use { input ->
          temporary.outputStream().use { output -> input.copyTo(output) }
        }
        if (sha256(temporary) != expectedSha256) {
          temporary.delete()
          throw IllegalStateException("The private assistant model failed integrity verification")
        }
        if (modelFile.exists()) modelFile.delete()
        if (!temporary.renameTo(modelFile)) {
          throw IllegalStateException("The verified private model could not be prepared")
        }
      }

      mapOf(
        "path" to modelFile.absolutePath,
        "checksumVerified" to true,
        "version" to "Qwen3-0.6B-Q8_0@1eaf4d9"
      )
    }
  }

  private fun sha256(file: File): String {
    val digest = MessageDigest.getInstance("SHA-256")
    FileInputStream(file).use { input ->
      val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
      while (true) {
        val count = input.read(buffer)
        if (count <= 0) break
        digest.update(buffer, 0, count)
      }
    }
    return digest.digest().joinToString("") { "%02x".format(it) }
  }
}
