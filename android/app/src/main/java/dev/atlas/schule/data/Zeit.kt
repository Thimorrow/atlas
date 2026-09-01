package dev.atlas.schule.data

import kotlinx.serialization.KSerializer
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import java.time.Instant
import java.time.LocalDate

// minSdk ist 26, damit ist java.time ohne Desugaring da. Eine zusaetzliche
// Datumsbibliothek waere hier nur ein weiterer Abhaengigkeitspfad fuer zwei
// Serialisierer.
//
// Die Trennung ist die aus .ytstack/API.md: dueDate und date sind reine
// Datumsangaben ohne Zeitzone, alles mit Z ist UTC.

object LocalDateSerialisierer : KSerializer<LocalDate> {
    override val descriptor = PrimitiveSerialDescriptor("LocalDate", PrimitiveKind.STRING)
    override fun serialize(encoder: Encoder, value: LocalDate) = encoder.encodeString(value.toString())
    override fun deserialize(decoder: Decoder): LocalDate = LocalDate.parse(decoder.decodeString())
}

object InstantSerialisierer : KSerializer<Instant> {
    override val descriptor = PrimitiveSerialDescriptor("Instant", PrimitiveKind.STRING)
    override fun serialize(encoder: Encoder, value: Instant) = encoder.encodeString(value.toString())
    override fun deserialize(decoder: Decoder): Instant = Instant.parse(decoder.decodeString())
}
