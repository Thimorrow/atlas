package dev.atlas.wrap

import android.annotation.SuppressLint
import android.app.DownloadManager
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.webkit.CookieManager
import android.webkit.DownloadListener
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.net.toUri

// Atlas als WebView um dieselbe Web-App, die auch im Browser laeuft.
//
// Der Grund fuer diese zweite App: jede Funktion ein zweites Mal in Kotlin
// nachzubauen kostet doppelt und laeuft der Web-App immer hinterher. Der
// Wrapper ist am Tag der Veroeffentlichung auf demselben Stand.
//
// Er ist bewusst kein nackter WebView-Container. Die Dinge, an denen ein
// Wrapper sonst als Browser ohne Adresszeile auffliegt, sind hier einzeln
// beantwortet: Zurueck-Taste, Anmeldung, die einen Neustart ueberlebt,
// Datei-Anhaenge in beide Richtungen, fremde Adressen, der Fall ohne Netz und
// ein Stand, der nach der Pause nicht von gestern ist.

private const val ATLAS_URL = "https://atlas-ten-orpin.vercel.app"
private const val ATLAS_HOST = "atlas-ten-orpin.vercel.app"

/** Ab dieser Pause gilt der angezeigte Stand als alt genug zum Nachladen. */
private const val VERALTET_NACH_MS = 15 * 60 * 1000L

class MainActivity : ComponentActivity() {

    private lateinit var webView: WebView
    private lateinit var stoerung: View

    /** Wann zuletzt wirklich etwas geladen wurde. Steuert das Nachladen beim Zurueckkommen. */
    private var letztesLaden = 0L

    /** Steht auf true, sobald der laufende Ladevorgang in einen Fehler lief. */
    private var ladenGescheitert = false

    // Datei-Anhaenge hochladen: die WebView reicht das Dateifeld an die App
    // weiter, und die Antwort muss zurueck an genau diesen Rueckruf.
    private var dateiRueckruf: ValueCallback<Array<Uri>>? = null
    private val dateiWaehler = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult(),
    ) { ergebnis ->
        val rueckruf = dateiRueckruf ?: return@registerForActivityResult
        dateiRueckruf = null
        rueckruf.onReceiveValue(
            WebChromeClient.FileChooserParams.parseResult(ergebnis.resultCode, ergebnis.data),
        )
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        webView = WebView(this).apply {
            setBackgroundColor(getColor(R.color.hintergrund))
            settings.konfiguriere()
            webViewClient = AtlasWebViewClient()
            webChromeClient = AtlasChromeClient()
            setDownloadListener(AtlasDownloadListener())
            // Die Web-App scrollt in eigenen Behaeltern. Ohne das hier haette
            // die WebView aussen herum noch einen zweiten Ueberdehn-Effekt.
            overScrollMode = View.OVER_SCROLL_NEVER
            isVerticalScrollBarEnabled = false
        }

        // Die Anmeldung gilt ein Jahr. Damit sie das auch ueberlebt, muessen
        // die Kekse auf die Platte, nicht nur in den Arbeitsspeicher.
        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)

        stoerung = baueStoerung()

        val wurzel = FrameLayout(this).apply {
            setBackgroundColor(getColor(R.color.hintergrund))
            fitsSystemWindows = true
            addView(
                webView,
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT,
            )
            addView(stoerung)
        }
        setContentView(wurzel)

        // Die Zurueck-Taste soll in der App zurueckblaettern, nicht die App
        // schliessen. Erst wenn es nichts mehr zurueckzublaettern gibt, gilt
        // wieder das Uebliche.
        onBackPressedDispatcher.addCallback(
            this,
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    if (webView.canGoBack()) webView.goBack() else finish()
                }
            },
        )

        if (savedInstanceState != null) {
            // Nach einem Themenwechsel wird die Activity neu gebaut. Ohne das
            // hier faenge der Nutzer wieder auf der Startseite an.
            webView.restoreState(savedInstanceState)
        } else {
            webView.loadUrl(ATLAS_URL)
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onPause() {
        super.onPause()
        // Ohne das steht die Anmeldung nach einem harten Beenden nicht mehr da.
        CookieManager.getInstance().flush()
    }

    override fun onResume() {
        super.onResume()
        // Eine App, die man aufklappt, soll den heutigen Stand zeigen und nicht
        // den von gestern Abend. Statt einer Geste zum Aktualisieren laedt sie
        // von selbst nach, wenn sie lange genug weg war.
        //
        // Die Schwelle ist bewusst grob: kurzes Wegtippen zur Nachricht und
        // zurueck darf die Seite nicht neu bauen, das verloere den Scrollstand und
        // halb getippte Eingaben.
        val jetzt = android.os.SystemClock.elapsedRealtime()
        if (letztesLaden != 0L && jetzt - letztesLaden > VERALTET_NACH_MS) {
            webView.reload()
        }
    }

    override fun onDestroy() {
        // Eine WebView, die den Baum nicht verlaesst, haelt die ganze Activity
        // fest.
        (webView.parent as? android.view.ViewGroup)?.removeView(webView)
        webView.destroy()
        super.onDestroy()
    }

    // --- Bausteine ----------------------------------------------------------

    private fun WebSettings.konfiguriere() {
        javaScriptEnabled = true
        // Die Web-App merkt sich Ansicht und Wochenwahl im localStorage.
        domStorageEnabled = true
        databaseEnabled = true
        loadWithOverviewMode = true
        useWideViewPort = true
        // Zoom bleibt moeglich, nur ohne die beiden Lupenknoepfe: sie zu
        // sperren nimmt Leuten mit schwacher Sehkraft ihr letztes Mittel.
        setSupportZoom(true)
        builtInZoomControls = true
        displayZoomControls = false
        mediaPlaybackRequiresUserGesture = false
        // Damit die Web-App spaeter erkennen kann, dass sie in der App laeuft,
        // ohne dass hier schon etwas davon abhaengt.
        userAgentString = "$userAgentString AtlasApp/1.0"
    }

    /**
     * Der Schirm ohne Netz. Er liegt ueber der Seite, statt sie zu ersetzen:
     * hinter ihm steht noch, was zuletzt geladen war, und nach einem
     * gelungenen Nachladen ist er einfach wieder weg.
     *
     * Bewusst von Hand gebaut statt mit den Standardwidgets. Ein graues
     * Material-Rechteck mit gebruellter Beschriftung ist genau die Stelle, an
     * der auffaellt, dass hier eine Webseite in einem Rahmen steckt.
     */
    private fun baueStoerung(): View {
        val dp = resources.displayMetrics.density
        fun px(wert: Float) = (wert * dp).toInt()

        val titel = TextView(this).apply {
            text = "Keine Verbindung"
            textSize = 17f
            typeface = android.graphics.Typeface.create("sans-serif-medium", android.graphics.Typeface.NORMAL)
            setTextColor(getColor(R.color.vordergrund))
            gravity = android.view.Gravity.CENTER
        }
        val erklaerung = TextView(this).apply {
            text = "Atlas ist gerade nicht erreichbar."
            textSize = 13f
            setTextColor(getColor(R.color.gedaempft))
            gravity = android.view.Gravity.CENTER
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            ).apply { topMargin = px(6f) }
        }
        val knopf = TextView(this).apply {
            text = "Erneut versuchen"
            textSize = 15f
            // Ohne das macht Android in einem Knopf Grossbuchstaben daraus.
            isAllCaps = false
            setTextColor(getColor(R.color.knopf_schrift))
            gravity = android.view.Gravity.CENTER
            // 44dp hoch und breit gepolstert: der einzige Knopf auf dem Schirm
            // darf nicht der sein, den man verfehlt.
            minHeight = px(44f)
            setPadding(px(20f), px(11f), px(20f), px(11f))
            background = android.graphics.drawable.GradientDrawable().apply {
                cornerRadius = px(10f).toFloat()
                setColor(getColor(R.color.vordergrund))
            }
            isClickable = true
            isFocusable = true
            setOnClickListener {
                stoerung.visibility = View.GONE
                ladenGescheitert = false
                webView.reload()
            }
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            ).apply { topMargin = px(20f) }
        }
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = android.view.Gravity.CENTER
            setBackgroundColor(getColor(R.color.hintergrund))
            setPadding(px(24f), px(24f), px(24f), px(24f))
            addView(titel)
            addView(erklaerung)
            addView(knopf)
            visibility = View.GONE
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT,
            )
        }
    }

    private inner class AtlasWebViewClient : WebViewClient() {

        override fun shouldOverrideUrlLoading(
            view: WebView,
            request: WebResourceRequest,
        ): Boolean {
            val ziel = request.url
            if (ziel.host == ATLAS_HOST) return false
            // Alles Fremde gehoert in den Browser, allen voran die Anmeldung
            // bei Microsoft: die weigert sich in einer eingebetteten WebView
            // grundsaetzlich. Der Rueckweg fuehrt ueber unseren eigenen
            // Callback und legt das Konto auf dem Server ab, die App muss davon
            // nichts mitbekommen.
            runCatching { startActivity(Intent(Intent.ACTION_VIEW, ziel)) }
            return true
        }

        override fun onPageStarted(view: WebView, url: String, favicon: android.graphics.Bitmap?) {
            ladenGescheitert = false
        }

        override fun onPageFinished(view: WebView, url: String) {
            letztesLaden = android.os.SystemClock.elapsedRealtime()
            // Der Stoerschirm verschwindet nur, wenn wirklich etwas ankam.
            // Sonst laege er sonst ueber einer leeren Seite.
            stoerung.visibility = if (ladenGescheitert) View.VISIBLE else View.GONE
        }

        override fun onReceivedError(
            view: WebView,
            request: WebResourceRequest,
            error: WebResourceError,
        ) {
            // Nur die Hauptseite zaehlt. Ein einzelnes Bild, das nicht laedt,
            // ist kein Grund, die ganze App abzudecken.
            if (!request.isForMainFrame) return
            ladenGescheitert = true
            stoerung.visibility = View.VISIBLE
        }

        override fun onReceivedHttpError(
            view: WebView,
            request: WebResourceRequest,
            errorResponse: WebResourceResponse,
        ) {
            if (!request.isForMainFrame) return
            // 401 ist kein Fehler, sondern die Passwortsperre: die Web-App
            // leitet selbst auf ihre Anmeldeseite um.
            if (errorResponse.statusCode == 401) return
            ladenGescheitert = true
            stoerung.visibility = View.VISIBLE
        }
    }

    private inner class AtlasChromeClient : WebChromeClient() {
        override fun onShowFileChooser(
            webView: WebView,
            filePathCallback: ValueCallback<Array<Uri>>,
            fileChooserParams: FileChooserParams,
        ): Boolean {
            // Ein noch offener Waehler wuerde sonst nie eine Antwort bekommen
            // und das Dateifeld der Seite bliebe fuer immer haengen.
            dateiRueckruf?.onReceiveValue(null)
            dateiRueckruf = filePathCallback
            return runCatching {
                dateiWaehler.launch(fileChooserParams.createIntent())
                true
            }.getOrElse {
                dateiRueckruf = null
                filePathCallback.onReceiveValue(null)
                false
            }
        }
    }

    private inner class AtlasDownloadListener : DownloadListener {
        override fun onDownloadStart(
            url: String,
            userAgent: String,
            contentDisposition: String,
            mimetype: String,
            contentLength: Long,
        ) {
            // Datei-Anhaenge liegen hinter der Passwortsperre. Der
            // DownloadManager hat die Kekse der WebView nicht, sie muessen ihm
            // mitgegeben werden, sonst laedt er die Anmeldeseite herunter.
            val anfrage = DownloadManager.Request(url.toUri()).apply {
                addRequestHeader("cookie", CookieManager.getInstance().getCookie(url) ?: "")
                addRequestHeader("user-agent", userAgent)
                setMimeType(mimetype)
                setNotificationVisibility(
                    DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED,
                )
                setDestinationInExternalPublicDir(
                    android.os.Environment.DIRECTORY_DOWNLOADS,
                    android.webkit.URLUtil.guessFileName(url, contentDisposition, mimetype),
                )
            }
            runCatching {
                (getSystemService(DOWNLOAD_SERVICE) as DownloadManager).enqueue(anfrage)
            }
        }
    }
}
