package ir.fabsteel.installer

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.print.PrintAttributes
import android.print.PrintManager
import android.util.Base64
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity

/** Offline WebView shell around assets/FabSteelViewer.html (same code as the Windows app). */
class MainActivity : AppCompatActivity() {

    private lateinit var web: WebView
    private var pageReady = false
    private var pendingUri: Uri? = null
    private var filePathCallback: ValueCallback<Array<Uri>>? = null

    private val chooser = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { r ->
        val cb = filePathCallback
        filePathCallback = null
        val uris = if (r.resultCode == Activity.RESULT_OK)
            WebChromeClient.FileChooserParams.parseResult(r.resultCode, r.data) else null
        cb?.onReceiveValue(uris)
    }

    /** window.FabNative.printPdf(name) -> Android print dialog ("Save as PDF"). */
    inner class Bridge {
        /** window.FabNative.shareText(title, text) -> Android share sheet (WhatsApp, Telegram, ...). */
        @JavascriptInterface
        fun shareText(title: String, text: String) {
            runOnUiThread {
                val i = Intent(Intent.ACTION_SEND).apply {
                    type = "text/plain"
                    putExtra(Intent.EXTRA_SUBJECT, title)
                    putExtra(Intent.EXTRA_TEXT, text)
                }
                startActivity(Intent.createChooser(i, title))
            }
        }

        @JavascriptInterface
        fun printPdf(name: String) {
            runOnUiThread {
                val pm = getSystemService(PRINT_SERVICE) as PrintManager
                pm.print(name, web.createPrintDocumentAdapter(name), PrintAttributes.Builder().build())
            }
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        web = WebView(this)
        window.statusBarColor = android.graphics.Color.BLACK
        window.navigationBarColor = android.graphics.Color.BLACK
        setContentView(web)
        // Back button: from a section go back to the home screen first, then exit
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                web.evaluateJavascript("(window.FabBack&&window.FabBack())===true") { r ->
                    if (r != "true") { finish() }
                }
            }
        })
        with(web.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = true
            builtInZoomControls = false
            setSupportZoom(false)
        }
        web.addJavascriptInterface(Bridge(), "FabNative")
        web.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                pageReady = true
                pendingUri?.let { loadUri(it); pendingUri = null }
            }
        }
        web.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                wv: WebView?, cb: ValueCallback<Array<Uri>>?, p: FileChooserParams?
            ): Boolean {
                filePathCallback?.onReceiveValue(null)
                filePathCallback = cb
                val i = Intent(Intent.ACTION_GET_CONTENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = "*/*"
                }
                chooser.launch(i)
                return true
            }
        }
        web.loadUrl("file:///android_asset/FabSteelViewer.html")
        handleIntent(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
    }

    @Suppress("DEPRECATION")
    private fun handleIntent(i: Intent?) {
        val uri: Uri? = when (i?.action) {
            Intent.ACTION_VIEW -> i.data
            Intent.ACTION_SEND ->
                if (Build.VERSION.SDK_INT >= 33) i.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
                else i.getParcelableExtra(Intent.EXTRA_STREAM)
            else -> null
        }
        if (uri != null) { if (pageReady) loadUri(uri) else pendingUri = uri }
    }

    private fun loadUri(uri: Uri) {
        try {
            val bytes = contentResolver.openInputStream(uri)!!.use { it.readBytes() }
            val b64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
            val name = (uri.lastPathSegment ?: "mobile.fabsteel").replace("'", "")
            web.evaluateJavascript("window.FabLoadBase64('$b64','$name')", null)
        } catch (e: Exception) {
            web.evaluateJavascript("alert('Cannot open file')", null)
        }
    }
}
