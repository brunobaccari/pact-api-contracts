export async function bookingSummary(baseUrl, id) {
  const response = await fetch(`${baseUrl}/booking/${id}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
  if (response.status === 404) return null;
  if (response.status !== 200) throw new Error(`Booking lookup returned HTTP ${response.status}`);
  const booking = await response.json();
  return {
    guest: `${booking.firstname} ${booking.lastname}`,
    total: booking.totalprice,
    paid: booking.depositpaid,
    checkin: booking.bookingdates.checkin,
    checkout: booking.bookingdates.checkout,
  };
}
