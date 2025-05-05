// services/chat_service.dart
import 'dart:convert';
import 'package:frontend/app/secrets/secret.dart';
import 'package:http/http.dart' as http;

class ChatService {
  final String baseUrl = Secrets.baseUrl; // change for emulator/device

  Future<Map<String, dynamic>> sendMessage(String message, String userId) async {
    final url = Uri.parse('$baseUrl/schedule-meeting');

    final response = await http.post(
      url,
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'userId':userId,'userMessage': message, }),
    );
  print("Response: ${response}");
    if (response.statusCode == 200) {
      return jsonDecode(response.body);
    } else {
      throw Exception("Failed to get response from backend");
    }
  }
}
