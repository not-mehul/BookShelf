package app.mehul.bookshelf.widget

import android.content.Context
import android.content.Intent
import androidx.compose.runtime.Composable
import androidx.core.net.toUri
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalContext
import androidx.glance.LocalSize
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.LinearProgressIndicator
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.semantics.contentDescription
import androidx.glance.semantics.semantics
import androidx.glance.text.FontFamily
import androidx.glance.text.FontStyle
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import app.mehul.bookshelf.MainActivity
import app.mehul.bookshelf.R

/**
 * Home-screen widget with three responsive layouts:
 *  - small:  shelf count
 *  - medium: what you're reading/watching now (with progress) + counts
 *  - large:  up to three in-progress items + the latest quote
 * Tapping opens the app; "+" opens the add flow. Colours follow the app's
 * Dusk / Dawn theme.
 */
// Responsive size buckets (the launcher picks the best fit as the user resizes).
private val SMALL = DpSize(110.dp, 48.dp)
private val MEDIUM = DpSize(250.dp, 110.dp)
private val LARGE = DpSize(250.dp, 250.dp)

class BookShelfWidget : GlanceAppWidget() {

    override val sizeMode = SizeMode.Responsive(setOf(SMALL, MEDIUM, LARGE))

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val data = WidgetData.load(context)
        provideContent { WidgetContent(data) }
    }

}

class BookShelfWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = BookShelfWidget()
}

// ── Palette (from src/styles/tokens.css) ───────────────────────────

private class Palette(dark: Boolean) {
    val background = ColorProvider(if (dark) Color(0xFF14110E) else Color(0xFFF3ECE0))
    val panel = ColorProvider(if (dark) Color(0xFF1F1A15) else Color(0xFFFBF6EC))
    val heading = ColorProvider(if (dark) Color(0xFFF5ECD9) else Color(0xFF211D17))
    val muted = ColorProvider(if (dark) Color(0xFFA8A29E) else Color(0xFF6B6358))
    val accent = ColorProvider(if (dark) Color(0xFFD4A574) else Color(0xFFB07D3E))
    val track = ColorProvider(if (dark) Color(0xFF2A241E) else Color(0xFFE6DCCB))
    val onAccent = ColorProvider(if (dark) Color(0xFF14110E) else Color(0xFFFFFBF3))
}

// ── Layouts ────────────────────────────────────────────────────────

@Composable
private fun WidgetContent(data: WidgetData) {
    val context = LocalContext.current
    val size = LocalSize.current
    val p = Palette(data.darkTheme)
    val open = actionStartActivity(Intent(context, MainActivity::class.java))

    Box(
        modifier = GlanceModifier.fillMaxSize().background(p.background).cornerRadius(16.dp).clickable(open)
            .padding(horizontal = 14.dp, vertical = 12.dp),
    ) {
        when {
            size.width >= LARGE.width && size.height >= LARGE.height -> Large(data, p)
            size.width >= MEDIUM.width && size.height >= MEDIUM.height -> Medium(data, p)
            else -> Small(data, p)
        }
    }
}

@Composable
private fun Small(data: WidgetData, p: Palette) {
    Row(modifier = GlanceModifier.fillMaxSize(), verticalAlignment = Alignment.CenterVertically) {
        Column(modifier = GlanceModifier.defaultWeight()) {
            Text(data.total.toString(), style = TextStyle(color = p.accent, fontSize = 24.sp, fontFamily = FontFamily.Serif))
            Text(
                if (data.total == 1) "entry" else "entries",
                style = TextStyle(color = p.muted, fontSize = 11.sp),
            )
        }
        AddButton(p)
    }
}

@Composable
private fun Medium(data: WidgetData, p: Palette) {
    Column(modifier = GlanceModifier.fillMaxSize()) {
        Header(data, p)
        Spacer(GlanceModifier.height(8.dp))
        val current = data.inProgress.firstOrNull()
        if (current != null) {
            ProgressItem(current, p)
        } else {
            EmptyLine(data, p)
        }
    }
}

@Composable
private fun Large(data: WidgetData, p: Palette) {
    Column(modifier = GlanceModifier.fillMaxSize()) {
        Header(data, p)
        Spacer(GlanceModifier.height(10.dp))
        if (data.inProgress.isEmpty()) {
            EmptyLine(data, p)
        } else {
            SectionLabel("In progress", p)
            data.inProgress.take(3).forEach { item ->
                Spacer(GlanceModifier.height(6.dp))
                ProgressItem(item, p)
            }
        }
        data.quote?.let { quote ->
            Spacer(GlanceModifier.height(12.dp))
            Column(modifier = GlanceModifier.fillMaxWidth().background(p.panel).cornerRadius(8.dp).padding(10.dp)) {
                Text(
                    "“${quote.text}”",
                    maxLines = 4,
                    style = TextStyle(color = p.heading, fontSize = 13.sp, fontStyle = FontStyle.Italic, fontFamily = FontFamily.Serif),
                )
                if (quote.author.isNotBlank()) {
                    Text("— ${quote.author}", maxLines = 1, style = TextStyle(color = p.muted, fontSize = 11.sp))
                }
            }
        }
    }
}

// ── Pieces ─────────────────────────────────────────────────────────

@Composable
private fun Header(data: WidgetData, p: Palette) {
    Row(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Column(modifier = GlanceModifier.defaultWeight()) {
            Text("BookShelf", style = TextStyle(color = p.heading, fontSize = 16.sp, fontFamily = FontFamily.Serif))
            Text(countsLine(data), maxLines = 1, style = TextStyle(color = p.muted, fontSize = 11.sp))
        }
        AddButton(p)
    }
}

@Composable
private fun ProgressItem(item: WidgetData.Item, p: Palette) {
    Column(modifier = GlanceModifier.fillMaxWidth()) {
        Text(
            item.title,
            maxLines = 1,
            style = TextStyle(color = p.heading, fontSize = 14.sp, fontWeight = FontWeight.Medium, fontFamily = FontFamily.Serif),
        )
        val sub = listOfNotNull(
            item.creator.takeIf { it.isNotBlank() },
            item.progress?.let { "${(it * 100).toInt()}%" },
        ).joinToString(" · ")
        if (sub.isNotEmpty()) Text(sub, maxLines = 1, style = TextStyle(color = p.muted, fontSize = 11.sp))
        item.progress?.let {
            Spacer(GlanceModifier.height(4.dp))
            LinearProgressIndicator(
                progress = it,
                modifier = GlanceModifier.fillMaxWidth().height(4.dp),
                color = p.accent,
                backgroundColor = p.track,
            )
        }
    }
}

@Composable
private fun EmptyLine(data: WidgetData, p: Palette) {
    Text(
        if (data.total == 0) "Your shelf is empty — tap + to add something." else "Nothing in progress right now.",
        maxLines = 2,
        style = TextStyle(color = p.muted, fontSize = 12.sp, fontStyle = FontStyle.Italic),
    )
}

@Composable
private fun SectionLabel(text: String, p: Palette) {
    Text(text.uppercase(), style = TextStyle(color = p.muted, fontSize = 10.sp, fontWeight = FontWeight.Medium))
}

@Composable
private fun AddButton(p: Palette) {
    val context = LocalContext.current
    val addIntent = Intent(context, MainActivity::class.java)
        .putExtra(MainActivity.EXTRA_ACTION, MainActivity.ACTION_ADD)
        // Distinct data so the system doesn't merge it with the plain "open" intent.
        .setData("bookshelf://widget/add".toUri())
    Box(
        modifier = GlanceModifier.size(36.dp).background(p.accent).cornerRadius(18.dp)
            .clickable(actionStartActivity(addIntent))
            .semantics { contentDescription = context.getString(R.string.widget_add) },
        contentAlignment = Alignment.Center,
    ) {
        Image(
            provider = ImageProvider(R.drawable.ic_widget_add),
            contentDescription = null,
            modifier = GlanceModifier.size(18.dp),
            colorFilter = androidx.glance.ColorFilter.tint(p.onAccent),
        )
    }
}

private fun countsLine(data: WidgetData): String {
    if (data.total == 0) return "No entries yet"
    return listOfNotNull(
        data.books.takeIf { it > 0 }?.let { "$it ${if (it == 1) "book" else "books"}" },
        data.movies.takeIf { it > 0 }?.let { "$it ${if (it == 1) "movie" else "movies"}" },
        data.shows.takeIf { it > 0 }?.let { "$it ${if (it == 1) "show" else "shows"}" },
        data.quotes.takeIf { it > 0 }?.let { "$it ${if (it == 1) "quote" else "quotes"}" },
    ).joinToString(" · ")
}
