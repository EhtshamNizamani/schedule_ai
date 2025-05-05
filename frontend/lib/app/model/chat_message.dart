
class ChatMessage {
  final String text;
  final bool isUser;
  final List<String>? missingFields; // if any
  final bool isSuccess;

  ChatMessage({
    required this.text,
    required this.isUser,
    this.missingFields,
    this.isSuccess = false,
  });

  // Factory constructor to handle API response
  factory ChatMessage.fromApiResponse(Map<String, dynamic> response) {
    if (response['status'] == 'success') {
      final data = response['data'];
      return ChatMessage(
        text:
            "Meeting scheduled with ${data['name']} about '${data['title']}' at ${data['datetime']}",
        isUser: false,
        isSuccess: true,
      );
    } else if (response['status'] == 'incomplete') {
      final missing = List<String>.from(response['missing']);
      return ChatMessage(
        text: response['message'],
        isUser: false,
        missingFields: missing,
        isSuccess: false,
      );
    } else {
      return ChatMessage(
        text: "Something went wrong. Try again.",
        isUser: false,
        isSuccess: false,
      );
    }
  }
}
